/**
 * Events Routes
 *
 * Fastify plugin that registers event-related endpoints under the /events prefix.
 * All routes require JWT authentication.
 */

import { z } from 'zod';
import { createLogger } from '../../logging/index.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateBody, validateQuery, validateParams } from '../../middleware/validate.js';
import { parsePagination, formatPaginatedResponse } from '../../shared/pagination.js';
import { NotFoundError, ValidationError } from '../../shared/errors.js';
import * as eventsRepo from './repository.js';
import * as eventsService from './service.js';
import * as approvalsService from '../approvals/service.js';
import db from '../../db/connection.js';

const log = createLogger('events:routes');

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const createEventBodySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a valid date in YYYY-MM-DD format'),
  headcount: z.number().int().min(1),
  budget_amount: z.number().min(0),
  budget_cap: z.number().min(0).optional(),
});

const listEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  state: z.enum(['draft', 'submitted', 'approved', 'in_service', 'closed']).optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().max(200).optional(),
  sortBy: z.enum(['title', 'event_date', 'headcount', 'state', 'budget_amount', 'created_at', 'updated_at']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional().default('asc'),
});

const eventIdParamSchema = z.object({
  id: z.string().uuid(),
});

const eventAndMaterialIdParamSchema = z.object({
  id: z.string().uuid(),
  materialId: z.string().uuid(),
});

const eventAndWindowIdParamSchema = z.object({
  id: z.string().uuid(),
  windowId: z.string().uuid(),
});

const updateEventBodySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a valid date in YYYY-MM-DD format').optional(),
  headcount: z.number().int().min(1).optional(),
  budget_amount: z.number().min(0).optional(),
  budget_cap: z.number().min(0).optional(),
});

const transitionStateBodySchema = z.object({
  state: z.enum(['submitted', 'approved', 'in_service', 'closed']),
});

const addMaterialBodySchema = z.object({
  material_type: z.enum(['recipe', 'rental']),
  recipe_version_id: z.string().uuid().optional(),
  rental_resource_id: z.string().uuid().optional(),
  display_quantity: z.number().min(0),
  unit: z.string().max(50).optional(),
});

const addServiceWindowBodySchema = z.object({
  label: z.string().min(1).max(100),
  start_at: z.string().datetime({ offset: true }),
  end_at: z.string().datetime({ offset: true }),
});

const addResourceRequestBodySchema = z.object({
  resource_id: z.string().uuid(),
  quantity: z.number().int().min(1),
  policy_exception_note: z.string().max(2000).optional(),
});

const auditTrailQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {object} _opts
 */
async function eventsRoutes(fastify, _opts) {

  // -------------------------------------------------------------------------
  // POST /events - Create a new event
  // -------------------------------------------------------------------------
  fastify.post(
    '/events',
    {
      preHandler: [
        authenticate,
        authorize('event:create'),
        validateBody(createEventBodySchema),
      ],
    },
    async (request, reply) => {
      const event = await eventsService.createEvent(request.user.userId, request.body);

      log.info(
        { action: 'create', eventId: event.id },
        'Event created',
      );

      return reply.status(201).send({ data: event });
    },
  );

  // -------------------------------------------------------------------------
  // GET /events - List events (paginated, filterable)
  // -------------------------------------------------------------------------
  fastify.get(
    '/events',
    {
      preHandler: [
        authenticate,
        authorize('event:read'),
        validateQuery(listEventsQuerySchema),
      ],
    },
    async (request, reply) => {
      const pagination = parsePagination(request.query);
      const { state, fromDate, toDate, search } = request.query;

      const { data, total } = await eventsRepo.findAll({
        ...pagination,
        state,
        fromDate,
        toDate,
        search,
      });

      log.info(
        { action: 'list', page: pagination.page, total },
        'Listed events',
      );

      return reply.status(200).send(formatPaginatedResponse(data, total, pagination));
    },
  );

  // -------------------------------------------------------------------------
  // GET /events/:id - Get event by ID (includes sub-resources)
  // -------------------------------------------------------------------------
  fastify.get(
    '/events/:id',
    {
      preHandler: [
        authenticate,
        authorize('event:read'),
        validateParams(eventIdParamSchema),
      ],
    },
    async (request, reply) => {
      const { id } = request.params;

      const event = await eventsRepo.findById(id);
      if (!event) {
        throw new NotFoundError('Event', id);
      }

      // Include sub-resources
      const [serviceWindows, materials, resourceRequests] = await Promise.all([
        eventsRepo.getServiceWindows(id),
        eventsRepo.getMaterials(id),
        eventsRepo.getResourceRequests(id),
      ]);

      log.info({ action: 'getById', eventId: id }, 'Retrieved event by id');

      return reply.status(200).send({
        data: {
          ...event,
          service_windows: serviceWindows,
          materials,
          resource_requests: resourceRequests,
        },
      });
    },
  );

  // -------------------------------------------------------------------------
  // PATCH /events/:id - Update event
  // -------------------------------------------------------------------------
  fastify.patch(
    '/events/:id',
    {
      preHandler: [
        authenticate,
        authorize('event:update'),
        validateParams(eventIdParamSchema),
        validateBody(updateEventBodySchema),
      ],
    },
    async (request, reply) => {
      const { id } = request.params;

      const updated = await eventsService.updateEvent(
        request.user.userId,
        id,
        request.body,
      );

      log.info({ action: 'update', eventId: id }, 'Event updated');

      return reply.status(200).send({ data: updated });
    },
  );

  // -------------------------------------------------------------------------
  // PATCH /events/:id/state - Transition event state
  // -------------------------------------------------------------------------
  fastify.patch(
    '/events/:id/state',
    {
      preHandler: [
        authenticate,
        validateParams(eventIdParamSchema),
        validateBody(transitionStateBodySchema),
      ],
    },
    async (request, reply) => {
      const { id } = request.params;
      const { state: newState } = request.body;

      // State-specific permission checks
      const permissionMap = {
        approved: 'event:approve',
        in_service: 'event:service',
        closed: 'event:close',
      };

      const requiredPerm = permissionMap[newState];
      if (requiredPerm) {
        const userPerms = request.user.permissions || [];
        if (!userPerms.includes(requiredPerm)) {
          return reply.status(403).send({
            code: 'FORBIDDEN',
            message: 'Insufficient permissions',
            details: { required: [requiredPerm], actual: userPerms },
            requestId: request.id,
          });
        }
      }

      // Submit is a special case: only the event creator may submit their own
      // draft, unless the caller holds an elevated 'event:submit' permission
      // (assigned to admins / privileged workflow users). This prevents any
      // authenticated user with `event:read` from pushing someone else's
      // draft into the approval queue.
      if (newState === 'submitted') {
        const event = await eventsRepo.findById(id);
        if (!event) {
          throw new NotFoundError('Event', id);
        }
        const userPerms = request.user.permissions || [];
        const userRoles = request.user.roles || [];
        const isCreator = event.created_by === request.user.userId;
        const isElevated = userPerms.includes('event:submit') || userRoles.includes('admin');
        if (!isCreator && !isElevated) {
          return reply.status(403).send({
            code: 'FORBIDDEN',
            message: 'Only the event creator can submit this draft',
            details: null,
            requestId: request.id,
          });
        }
      }

      const updated = await eventsService.transitionState(
        request.user.userId,
        id,
        newState,
      );

      log.info(
        { action: 'transitionState', eventId: id, newState },
        `Event state transitioned to ${newState}`,
      );

      return reply.status(200).send({ data: updated });
    },
  );

  // -------------------------------------------------------------------------
  // GET /events/:id/audit-trail - Paginated audit trail
  // -------------------------------------------------------------------------
  fastify.get(
    '/events/:id/audit-trail',
    {
      preHandler: [
        authenticate,
        authorize('audit:read'),
        validateParams(eventIdParamSchema),
        validateQuery(auditTrailQuerySchema),
      ],
    },
    async (request, reply) => {
      const { id } = request.params;
      const pagination = parsePagination(request.query);

      const { data, total } = await eventsService.getEventAuditTrail(id, pagination);

      log.info(
        { action: 'getAuditTrail', eventId: id, page: pagination.page, total },
        'Retrieved event audit trail',
      );

      return reply.status(200).send(formatPaginatedResponse(data, total, pagination));
    },
  );

  // -------------------------------------------------------------------------
  // POST /events/:id/materials - Add material to event
  // -------------------------------------------------------------------------
  fastify.post(
    '/events/:id/materials',
    {
      preHandler: [
        authenticate,
        authorize('event:update'),
        validateParams(eventIdParamSchema),
        validateBody(addMaterialBodySchema),
      ],
    },
    async (request, reply) => {
      const { id: eventId } = request.params;

      // Verify event exists
      const event = await eventsRepo.findById(eventId);
      if (!event) {
        throw new NotFoundError('Event', eventId);
      }

      const { material_type, recipe_version_id, rental_resource_id, display_quantity, unit } = request.body;

      // Validate that recipe versions must be 'approved' status
      if (material_type === 'recipe' && recipe_version_id) {
        const recipeVersion = await db('recipe_versions')
          .where({ id: recipe_version_id })
          .first();

        if (!recipeVersion) {
          throw new NotFoundError('RecipeVersion', recipe_version_id);
        }
        if (recipeVersion.status !== 'approved') {
          throw new ValidationError([
            {
              path: 'recipe_version_id',
              message: `Recipe version must have 'approved' status, but has '${recipeVersion.status}'`,
            },
          ]);
        }
      }

      const material = await eventsRepo.addMaterial({
        event_id: eventId,
        material_type,
        recipe_version_id: recipe_version_id || null,
        rental_resource_id: rental_resource_id || null,
        display_quantity,
        unit: unit || null,
      });

      log.info(
        { action: 'addMaterial', eventId, materialId: material.id },
        'Material added to event',
      );

      return reply.status(201).send({ data: material });
    },
  );

  // -------------------------------------------------------------------------
  // DELETE /events/:id/materials/:materialId - Remove material
  // -------------------------------------------------------------------------
  fastify.delete(
    '/events/:id/materials/:materialId',
    {
      preHandler: [
        authenticate,
        authorize('event:update'),
        validateParams(eventAndMaterialIdParamSchema),
      ],
    },
    async (request, reply) => {
      const { id: eventId, materialId } = request.params;

      // Verify event exists
      const event = await eventsRepo.findById(eventId);
      if (!event) {
        throw new NotFoundError('Event', eventId);
      }

      // Scope the delete to (materialId, eventId). A 0-row result means
      // either the material doesn't exist or it belongs to a different event.
      const deletedCount = await eventsRepo.removeMaterial(materialId, eventId);
      if (deletedCount === 0) {
        throw new NotFoundError('EventMaterial', materialId);
      }

      log.info(
        { action: 'removeMaterial', eventId, materialId },
        'Material removed from event',
      );

      return reply.status(200).send({ message: 'Material removed successfully' });
    },
  );

  // -------------------------------------------------------------------------
  // POST /events/:id/service-windows - Add service window
  // -------------------------------------------------------------------------
  fastify.post(
    '/events/:id/service-windows',
    {
      preHandler: [
        authenticate,
        authorize('event:update'),
        validateParams(eventIdParamSchema),
        validateBody(addServiceWindowBodySchema),
      ],
    },
    async (request, reply) => {
      const { id: eventId } = request.params;

      // Verify event exists
      const event = await eventsRepo.findById(eventId);
      if (!event) {
        throw new NotFoundError('Event', eventId);
      }

      const { label, start_at, end_at } = request.body;

      const window = await eventsRepo.addServiceWindow({
        event_id: eventId,
        label,
        start_at,
        end_at,
      });

      log.info(
        { action: 'addServiceWindow', eventId, windowId: window.id },
        'Service window added to event',
      );

      return reply.status(201).send({ data: window });
    },
  );

  // -------------------------------------------------------------------------
  // DELETE /events/:id/service-windows/:windowId - Remove service window
  // -------------------------------------------------------------------------
  fastify.delete(
    '/events/:id/service-windows/:windowId',
    {
      preHandler: [
        authenticate,
        authorize('event:update'),
        validateParams(eventAndWindowIdParamSchema),
      ],
    },
    async (request, reply) => {
      const { id: eventId, windowId } = request.params;

      // Verify event exists
      const event = await eventsRepo.findById(eventId);
      if (!event) {
        throw new NotFoundError('Event', eventId);
      }

      // Scope the delete to (windowId, eventId). A 0-row result means the
      // window doesn't exist or it belongs to a different event.
      const deletedCount = await eventsRepo.removeServiceWindow(windowId, eventId);
      if (deletedCount === 0) {
        throw new NotFoundError('EventServiceWindow', windowId);
      }

      log.info(
        { action: 'removeServiceWindow', eventId, windowId },
        'Service window removed from event',
      );

      return reply.status(200).send({ message: 'Service window removed successfully' });
    },
  );

  // -------------------------------------------------------------------------
  // POST /events/:id/resource-requests - Add resource request
  // -------------------------------------------------------------------------
  fastify.post(
    '/events/:id/resource-requests',
    {
      preHandler: [
        authenticate,
        authorize('resource:request'),
        validateParams(eventIdParamSchema),
        validateBody(addResourceRequestBodySchema),
      ],
    },
    async (request, reply) => {
      const { id: eventId } = request.params;

      // Verify event exists
      const event = await eventsRepo.findById(eventId);
      if (!event) {
        throw new NotFoundError('Event', eventId);
      }

      const { resource_id, quantity, policy_exception_note } = request.body;

      // Look up the resource to check requires_approval and quota
      const resource = await db('resources').where({ id: resource_id }).first();
      if (!resource) {
        throw new NotFoundError('Resource', resource_id);
      }

      // Check quota
      if (resource.quota_per_event && quantity > resource.quota_per_event) {
        if (!policy_exception_note) {
          throw new ValidationError([
            {
              path: 'policy_exception_note',
              message: `Quantity ${quantity} exceeds quota of ${resource.quota_per_event} per event. A policy_exception_note is required.`,
            },
          ]);
        }
      }

      // Create the resource request
      const resourceRequest = await eventsRepo.addResourceRequest({
        event_id: eventId,
        resource_id,
        quantity,
        status: 'pending',
        policy_exception_note: policy_exception_note || null,
      });

      // If resource requires approval, auto-create special_resource approval
      if (resource.requires_approval) {
        await approvalsService.createApproval({
          event_id: eventId,
          approval_type: 'special_resource',
          requested_by: request.user.userId,
          justification: `Resource '${resource.name}' requires approval`,
        });
      }

      // If quantity exceeds quota, auto-create quota_override approval
      if (resource.quota_per_event && quantity > resource.quota_per_event) {
        await approvalsService.createApproval({
          event_id: eventId,
          approval_type: 'quota_override',
          requested_by: request.user.userId,
          old_amount: resource.quota_per_event,
          new_amount: quantity,
          justification: policy_exception_note || `Quantity ${quantity} exceeds quota of ${resource.quota_per_event}`,
        });

        // Also create a policy exception record
        await db('policy_exceptions').insert({
          event_id: eventId,
          resource_id,
          requested_quantity: quantity,
          quota_per_event: resource.quota_per_event,
          note: policy_exception_note,
          requested_by: request.user.userId,
        });
      }

      log.info(
        { action: 'addResourceRequest', eventId, requestId: resourceRequest.id },
        'Resource request added to event',
      );

      return reply.status(201).send({ data: resourceRequest });
    },
  );
}

export default eventsRoutes;
