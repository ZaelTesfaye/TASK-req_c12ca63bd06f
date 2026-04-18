/**
 * Attachments Routes
 *
 * Fastify plugin that registers attachment-related endpoints under the /attachments prefix.
 * Supports multipart file uploads with per-file validation results.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { createLogger } from '../../logging/index.js';
import config from '../../config/index.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateParams } from '../../middleware/validate.js';
import { ForbiddenError, NotFoundError } from '../../shared/errors.js';
import db from '../../db/connection.js';
import * as attachmentsRepo from './repository.js';
import * as attachmentsService from './service.js';

const log = createLogger('attachments:routes');

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const attachmentIdParamSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Parent-access helpers
// ---------------------------------------------------------------------------

/**
 * Throw ForbiddenError unless the caller is allowed to see the parent of
 * an attachment (event or recipe version).
 *
 * For events: admin role, event creator, or an explicit manager_event_scopes
 * row grants access. Everyone else is rejected — attachment:read alone is
 * not sufficient.
 *
 * For recipe-version attachments: any user with recipe:create, recipe:review
 * or recipe:approve is allowed. Recipes are a shared authoring workspace,
 * not a per-user resource.
 *
 * Attachments without a parent (both FKs null) are considered globally
 * readable for any attachment:read holder.
 *
 * @param {{ userId: string, roles?: string[], permissions?: string[] }} user
 * @param {{ event_id: string|null, recipe_version_id: string|null }} parentRefs
 */
async function assertAttachmentParentAccess(user, parentRefs) {
  const roles = user.roles || [];
  const perms = user.permissions || [];

  if (roles.includes('admin')) return;

  if (parentRefs.event_id) {
    const event = await db('events').where({ id: parentRefs.event_id }).first();
    if (event) {
      if (event.created_by === user.userId) return;
      const scope = await db('manager_event_scopes')
        .where({ user_id: user.userId, event_id: parentRefs.event_id })
        .first();
      if (scope) return;
    }
    throw new ForbiddenError('You do not have access to this event\'s attachments');
  }

  if (parentRefs.recipe_version_id) {
    const hasRecipePerm =
      perms.includes('recipe:create') ||
      perms.includes('recipe:review') ||
      perms.includes('recipe:approve');
    if (hasRecipePerm) return;
    throw new ForbiddenError('You do not have access to this recipe\'s attachments');
  }

  // Unscoped attachment (event_id and recipe_version_id both null).
  // Only possible via admin uploads today; require admin role.
  throw new ForbiddenError('Insufficient permissions for this attachment');
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {object} _opts
 */
async function attachmentsRoutes(fastify, _opts) {

  // -------------------------------------------------------------------------
  // POST /attachments - Upload file(s) via multipart
  // -------------------------------------------------------------------------
  fastify.post(
    '/attachments',
    {
      preHandler: [
        authenticate,
        authorize('attachment:upload'),
      ],
    },
    async (request, reply) => {
      const eventId = request.query.event_id || null;
      const recipeVersionId = request.query.recipe_version_id || null;

      // Parent-access gate: reject uploads targeting an event/recipe the
      // caller cannot see. attachment:upload alone is not sufficient.
      await assertAttachmentParentAccess(request.user, {
        event_id: eventId,
        recipe_version_id: recipeVersionId,
      });

      const results = [];
      const parts = request.parts();

      for await (const part of parts) {
        if (part.type !== 'file') continue;

        try {
          const buffer = await part.toBuffer();

          const attachment = await attachmentsService.upload(
            request.user.userId,
            {
              filename: part.filename,
              mimetype: part.mimetype,
              data: buffer,
            },
            { eventId, recipeVersionId },
          );

          results.push({
            filename: part.filename,
            status: 'success',
            attachment,
          });
        } catch (err) {
          log.warn(
            { action: 'upload', filename: part.filename, err: err.message },
            `Upload failed for file '${part.filename}'`,
          );

          results.push({
            filename: part.filename,
            status: 'error',
            error: {
              code: err.code || 'UPLOAD_FAILED',
              message: err.message,
              details: err.details || null,
            },
          });
        }
      }

      log.info(
        { action: 'upload', count: results.length },
        `Processed ${results.length} file upload(s)`,
      );

      return reply.status(200).send({ data: results });
    },
  );

  // -------------------------------------------------------------------------
  // GET /attachments?event_id=... - List attachments for an event
  // -------------------------------------------------------------------------
  fastify.get(
    '/attachments',
    {
      preHandler: [
        authenticate,
        authorize('attachment:read'),
      ],
    },
    async (request, reply) => {
      const eventId = request.query.event_id;
      const recipeVersionId = request.query.recipe_version_id;

      // Parent-access gate: a caller must be able to see the parent event
      // or recipe before we return the (potentially sensitive) file list.
      await assertAttachmentParentAccess(request.user, {
        event_id: eventId || null,
        recipe_version_id: recipeVersionId || null,
      });

      let attachments = [];
      if (eventId) {
        attachments = await attachmentsRepo.findByEvent(eventId);
      } else if (recipeVersionId) {
        attachments = await attachmentsRepo.findByRecipeVersion(recipeVersionId);
      }

      return reply.status(200).send({ data: attachments });
    },
  );

  // -------------------------------------------------------------------------
  // GET /attachments/:id - Get attachment metadata
  // -------------------------------------------------------------------------
  fastify.get(
    '/attachments/:id',
    {
      preHandler: [
        authenticate,
        authorize('attachment:read'),
        validateParams(attachmentIdParamSchema),
      ],
    },
    async (request, reply) => {
      const { id } = request.params;
      const attachment = await attachmentsRepo.findById(id);

      if (!attachment) {
        throw new NotFoundError('Attachment', id);
      }

      await assertAttachmentParentAccess(request.user, {
        event_id: attachment.event_id,
        recipe_version_id: attachment.recipe_version_id,
      });

      log.info({ action: 'getById', attachmentId: id }, 'Retrieved attachment metadata');

      return reply.status(200).send({ data: attachment });
    },
  );

  // -------------------------------------------------------------------------
  // GET /attachments/:id/download - Stream file download
  // -------------------------------------------------------------------------
  fastify.get(
    '/attachments/:id/download',
    {
      preHandler: [
        authenticate,
        authorize('attachment:read'),
        validateParams(attachmentIdParamSchema),
      ],
    },
    async (request, reply) => {
      const { id } = request.params;
      const attachment = await attachmentsRepo.findById(id);

      if (!attachment) {
        throw new NotFoundError('Attachment', id);
      }

      await assertAttachmentParentAccess(request.user, {
        event_id: attachment.event_id,
        recipe_version_id: attachment.recipe_version_id,
      });

      const filePath = join(config.upload.root, attachment.storage_path);

      // Verify file exists on disk
      try {
        await stat(filePath);
      } catch {
        log.error(
          { action: 'download', attachmentId: id, path: filePath },
          'Attachment file not found on disk',
        );
        throw new NotFoundError('AttachmentFile', id);
      }

      log.info({ action: 'download', attachmentId: id }, 'Streaming attachment download');

      const stream = createReadStream(filePath);

      return reply
        .header('Content-Type', attachment.mime_type)
        .header('Content-Disposition', `attachment; filename="${attachment.original_name}"`)
        .send(stream);
    },
  );
}

export default attachmentsRoutes;
