/**
 * Resources / Catalog Routes
 *
 * Fastify plugin that registers resource catalog endpoints under the /catalog prefix.
 * Manages resources, metadata templates, tags, and training links.
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createLogger } from '../../logging/index.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateBody, validateQuery, validateParams } from '../../middleware/validate.js';
import { parsePagination, formatPaginatedResponse } from '../../shared/pagination.js';
import { NotFoundError, ValidationError } from '../../shared/errors.js';
import { writeAudit } from '../../shared/audit.js';
import * as resourcesRepo from './repository.js';

const log = createLogger('resources:routes');

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const idParamSchema = z.object({
  id: z.string().uuid(),
});

const createResourceBodySchema = z.object({
  name: z.string().min(1).max(200),
  resource_type: z.string().min(1).max(50),
  parent_id: z.string().uuid().nullable().optional(),
  template_id: z.string().uuid().nullable().optional(),
  metadata_json: z.record(z.unknown()).optional(),
  requires_approval: z.boolean().optional().default(false),
  quota_per_event: z.number().int().positive().nullable().optional(),
  tags: z.array(z.string().min(1).max(100)).optional(),
});

const updateResourceBodySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  resource_type: z.string().min(1).max(50).optional(),
  parent_id: z.string().uuid().nullable().optional(),
  template_id: z.string().uuid().nullable().optional(),
  metadata_json: z.record(z.unknown()).optional(),
  requires_approval: z.boolean().optional(),
  quota_per_event: z.number().int().positive().nullable().optional(),
});

const listResourcesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  sortBy: z.enum(['name', 'resource_type', 'status', 'created_at', 'updated_at']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional().default('asc'),
  status: z.string().optional(),
  resource_type: z.string().optional(),
  search: z.string().optional(),
});

const createTemplateBodySchema = z.object({
  resource_type: z.string().min(1).max(50),
  required_fields_json: z.array(z.unknown()).optional().default([]),
  validation_rules_json: z.record(z.unknown()).optional().default({}),
});

const updateTemplateBodySchema = z.object({
  resource_type: z.string().min(1).max(50).optional(),
  required_fields_json: z.array(z.unknown()).optional(),
  validation_rules_json: z.record(z.unknown()).optional(),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {object} _opts
 */
async function catalogRoutes(fastify, _opts) {

  // -------------------------------------------------------------------------
  // GET /catalog/tree - Hierarchical resource catalog tree
  // -------------------------------------------------------------------------
  fastify.get(
    '/catalog/tree',
    {
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const tree = await resourcesRepo.getTree();

      log.info(
        { action: 'getTree', rootCount: tree.length },
        'Returned catalog tree',
      );

      return reply.status(200).send({ data: tree });
    },
  );

  // -------------------------------------------------------------------------
  // POST /catalog/resources - Create a new resource
  // -------------------------------------------------------------------------
  fastify.post(
    '/catalog/resources',
    {
      preHandler: [
        authenticate,
        authorize('resource:manage'),
        validateBody(createResourceBodySchema),
      ],
    },
    async (request, reply) => {
      const body = request.body;

      // Validate metadata against template if template_id is provided
      if (body.template_id) {
        const template = await resourcesRepo.findTemplateById(body.template_id);
        if (!template) {
          throw new NotFoundError('MetadataTemplate', body.template_id);
        }

        if (body.metadata_json) {
          const validation = resourcesRepo.validateMetadata(body.metadata_json, template);
          if (!validation.valid) {
            throw new ValidationError(
              validation.errors.map((msg) => ({ path: 'metadata_json', message: msg })),
            );
          }
        }
      }

      const resource = await resourcesRepo.create(body);

      // Create tags if provided
      if (body.tags && body.tags.length > 0) {
        for (const tag of body.tags) {
          await resourcesRepo.addTag(resource.id, tag);
        }
      }

      // Re-fetch with all relations
      const full = await resourcesRepo.findById(resource.id);

      // Write audit trail
      await writeAudit({
        eventId: null,
        subjectType: 'resource',
        subjectId: resource.id,
        action: 'create',
        actorUserId: request.user.userId,
        before: null,
        after: full,
        notes: `Created resource '${body.name}'`,
      });

      log.info(
        { action: 'create', resourceId: resource.id, name: body.name },
        'Resource created',
      );

      return reply.status(201).send({ data: full });
    },
  );

  // -------------------------------------------------------------------------
  // PATCH /catalog/resources/:id - Update a resource
  // -------------------------------------------------------------------------
  fastify.patch(
    '/catalog/resources/:id',
    {
      preHandler: [
        authenticate,
        authorize('resource:manage'),
        validateParams(idParamSchema),
        validateBody(updateResourceBodySchema),
      ],
    },
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body;

      const before = await resourcesRepo.findById(id);
      if (!before) {
        throw new NotFoundError('Resource', id);
      }

      // Validate metadata against template if template_id is changing or metadata is updating
      const effectiveTemplateId = body.template_id !== undefined ? body.template_id : before.template_id;
      if (effectiveTemplateId && body.metadata_json) {
        const template = await resourcesRepo.findTemplateById(effectiveTemplateId);
        if (template) {
          const validation = resourcesRepo.validateMetadata(body.metadata_json, template);
          if (!validation.valid) {
            throw new ValidationError(
              validation.errors.map((msg) => ({ path: 'metadata_json', message: msg })),
            );
          }
        }
      }

      const updated = await resourcesRepo.update(id, body);
      const after = await resourcesRepo.findById(id);

      // Write audit trail
      await writeAudit({
        eventId: null,
        subjectType: 'resource',
        subjectId: id,
        action: 'update',
        actorUserId: request.user.userId,
        before,
        after,
        notes: `Updated resource '${after.name}'`,
      });

      log.info(
        { action: 'update', resourceId: id },
        'Resource updated',
      );

      return reply.status(200).send({ data: after });
    },
  );

  // -------------------------------------------------------------------------
  // POST /catalog/resources/:id/publish - Publish a resource
  // -------------------------------------------------------------------------
  fastify.post(
    '/catalog/resources/:id/publish',
    {
      preHandler: [
        authenticate,
        authorize('resource:manage'),
        validateParams(idParamSchema),
      ],
    },
    async (request, reply) => {
      const { id } = request.params;

      const before = await resourcesRepo.findById(id);
      if (!before) {
        throw new NotFoundError('Resource', id);
      }

      const updated = await resourcesRepo.publish(id);
      const after = await resourcesRepo.findById(id);

      // Write audit trail
      await writeAudit({
        eventId: null,
        subjectType: 'resource',
        subjectId: id,
        action: 'publish',
        actorUserId: request.user.userId,
        before,
        after,
        notes: `Published resource '${after.name}' (version ${after.version})`,
      });

      log.info(
        { action: 'publish', resourceId: id, version: updated.version },
        'Resource published',
      );

      return reply.status(200).send({ data: after });
    },
  );

  // -------------------------------------------------------------------------
  // GET /catalog/resources/:id - Get a single resource with all metadata
  // -------------------------------------------------------------------------
  fastify.get(
    '/catalog/resources/:id',
    {
      preHandler: [
        authenticate,
        validateParams(idParamSchema),
      ],
    },
    async (request, reply) => {
      const { id } = request.params;

      const resource = await resourcesRepo.findById(id);
      if (!resource) {
        throw new NotFoundError('Resource', id);
      }

      log.info(
        { action: 'getById', resourceId: id },
        'Retrieved resource by id',
      );

      return reply.status(200).send({ data: resource });
    },
  );

  // -------------------------------------------------------------------------
  // POST /catalog/templates - Create a metadata template
  // -------------------------------------------------------------------------
  fastify.post(
    '/catalog/templates',
    {
      preHandler: [
        authenticate,
        authorize('resource:manage'),
        validateBody(createTemplateBodySchema),
      ],
    },
    async (request, reply) => {
      const body = request.body;

      const template = await resourcesRepo.createTemplate(body);

      // Write audit trail
      await writeAudit({
        eventId: null,
        subjectType: 'metadata_template',
        subjectId: template.id,
        action: 'create',
        actorUserId: request.user.userId,
        before: null,
        after: template,
        notes: `Created metadata template for resource type '${body.resource_type}'`,
      });

      log.info(
        { action: 'createTemplate', templateId: template.id, resourceType: body.resource_type },
        'Metadata template created',
      );

      return reply.status(201).send({ data: template });
    },
  );

  // -------------------------------------------------------------------------
  // PATCH /catalog/templates/:id - Update a metadata template
  // -------------------------------------------------------------------------
  fastify.patch(
    '/catalog/templates/:id',
    {
      preHandler: [
        authenticate,
        authorize('resource:manage'),
        validateParams(idParamSchema),
        validateBody(updateTemplateBodySchema),
      ],
    },
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body;

      const before = await resourcesRepo.findTemplateById(id);
      if (!before) {
        throw new NotFoundError('MetadataTemplate', id);
      }

      const updated = await resourcesRepo.updateTemplate(id, body);

      // Write audit trail
      await writeAudit({
        eventId: null,
        subjectType: 'metadata_template',
        subjectId: id,
        action: 'update',
        actorUserId: request.user.userId,
        before,
        after: updated,
        notes: `Updated metadata template '${id}'`,
      });

      log.info(
        { action: 'updateTemplate', templateId: id },
        'Metadata template updated',
      );

      return reply.status(200).send({ data: updated });
    },
  );

  // -------------------------------------------------------------------------
  // POST /catalog/templates/:id/publish - Publish a metadata template
  // -------------------------------------------------------------------------
  fastify.post(
    '/catalog/templates/:id/publish',
    {
      preHandler: [
        authenticate,
        authorize('resource:manage'),
        validateParams(idParamSchema),
      ],
    },
    async (request, reply) => {
      const { id } = request.params;

      const before = await resourcesRepo.findTemplateById(id);
      if (!before) {
        throw new NotFoundError('MetadataTemplate', id);
      }

      const updated = await resourcesRepo.publishTemplate(id);

      // Write audit trail
      await writeAudit({
        eventId: null,
        subjectType: 'metadata_template',
        subjectId: id,
        action: 'publish',
        actorUserId: request.user.userId,
        before,
        after: updated,
        notes: `Published metadata template '${id}' (version ${updated.version})`,
      });

      log.info(
        { action: 'publishTemplate', templateId: id, version: updated.version },
        'Metadata template published',
      );

      return reply.status(200).send({ data: updated });
    },
  );

  // -------------------------------------------------------------------------
  // GET /catalog/templates - List all metadata templates
  // -------------------------------------------------------------------------
  fastify.get(
    '/catalog/templates',
    {
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const templates = await resourcesRepo.findAllTemplates();

      log.info(
        { action: 'listTemplates', count: templates.length },
        'Listed metadata templates',
      );

      return reply.status(200).send({ data: templates });
    },
  );
}

export default catalogRoutes;
