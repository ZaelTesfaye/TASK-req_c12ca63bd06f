/**
 * Entitlements Routes
 *
 * Fastify plugin that registers entitlement-related endpoints under the
 * /entitlements prefix. Covers listing, manual issuance, bulk import,
 * and idempotent redemption.
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createLogger } from '../../logging/index.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateBody, validateQuery, validateParams } from '../../middleware/validate.js';
import { parsePagination, formatPaginatedResponse } from '../../shared/pagination.js';
import { NotFoundError, ForbiddenError } from '../../shared/errors.js';
import * as entitlementsRepo from './repository.js';
import * as entitlementsService from './service.js';

const log = createLogger('entitlements:routes');

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const listEntitlementsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  user_id: z.string().uuid().optional(),
  event_id: z.string().uuid().optional(),
});

const entitlementIdParamSchema = z.object({
  id: z.string().uuid(),
});

const issueManualBodySchema = z.object({
  event_id: z.string().uuid(),
  user_id: z.string().uuid(),
  entitlement_type_id: z.string().uuid(),
  quantity_total: z.coerce.number().positive(),
  expires_at: z.string().datetime().optional(),
});

const confirmBulkBodySchema = z.object({
  batch_id: z.string().uuid(),
});

const redeemBodySchema = z.object({
  quantity: z.coerce.number().positive(),
  idempotency_key: z.string().uuid().optional(),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {object} _opts
 */
async function entitlementsRoutes(fastify, _opts) {

  // -------------------------------------------------------------------------
  // GET /entitlements - List entitlements
  // For regular users: returns their own entitlements
  // For admins (or users with entitlement:issue_manual): can query by user_id
  // -------------------------------------------------------------------------
  fastify.get(
    '/entitlements',
    {
      preHandler: [
        authenticate,
        validateQuery(listEntitlementsQuerySchema),
      ],
    },
    async (request, reply) => {
      const pagination = parsePagination(request.query);
      const { user_id: queryUserId, event_id } = request.query;

      // Determine which user's entitlements to fetch
      const userPermissions = request.user.permissions || [];
      const isPrivileged = userPermissions.includes('entitlement:issue_manual')
        || userPermissions.includes('admin:roles');

      let targetUserId;
      if (queryUserId && queryUserId !== request.user.userId) {
        // Requesting another user's entitlements — requires elevated permissions
        if (!isPrivileged) {
          throw new ForbiddenError('Cannot view entitlements for other users');
        }
        targetUserId = queryUserId;
      } else {
        targetUserId = request.user.userId;
      }

      const { data, total } = await entitlementsRepo.findByUser(targetUserId, {
        ...pagination,
        event_id,
      });

      log.info(
        { action: 'list', userId: targetUserId, page: pagination.page, total },
        'Listed entitlements',
      );

      return reply.status(200).send(formatPaginatedResponse(data, total, pagination));
    },
  );

  // -------------------------------------------------------------------------
  // GET /entitlements/:id - Get entitlement by ID
  // Object-level access: only the owner or privileged roles
  // -------------------------------------------------------------------------
  fastify.get(
    '/entitlements/:id',
    {
      preHandler: [
        authenticate,
        validateParams(entitlementIdParamSchema),
      ],
    },
    async (request, reply) => {
      const { id } = request.params;

      const entitlement = await entitlementsRepo.findById(id);
      if (!entitlement) {
        throw new NotFoundError('Entitlement', id);
      }

      // Object-level access check
      const isOwner = entitlement.user_id === request.user.userId;
      const userPermissions = request.user.permissions || [];
      const isPrivileged = userPermissions.includes('entitlement:issue_manual')
        || userPermissions.includes('admin:roles');

      if (!isOwner && !isPrivileged) {
        throw new ForbiddenError('Insufficient permissions to view this entitlement');
      }

      log.info({ action: 'getById', entitlementId: id }, 'Retrieved entitlement by id');

      return reply.status(200).send({ data: entitlement });
    },
  );

  // -------------------------------------------------------------------------
  // GET /entitlements/:id/redemptions - List redemptions for an entitlement
  // -------------------------------------------------------------------------
  fastify.get(
    '/entitlements/:id/redemptions',
    {
      preHandler: [
        authenticate,
        validateParams(entitlementIdParamSchema),
      ],
    },
    async (request, reply) => {
      const { id } = request.params;

      // Verify entitlement exists and check access
      const entitlement = await entitlementsRepo.findById(id);
      if (!entitlement) {
        throw new NotFoundError('Entitlement', id);
      }

      const isOwner = entitlement.user_id === request.user.userId;
      const userPermissions = request.user.permissions || [];
      const isPrivileged = userPermissions.includes('entitlement:issue_manual')
        || userPermissions.includes('admin:roles');

      if (!isOwner && !isPrivileged) {
        throw new ForbiddenError('Insufficient permissions to view redemptions for this entitlement');
      }

      const redemptions = await entitlementsRepo.findRedemptions(id);

      log.info(
        { action: 'listRedemptions', entitlementId: id, count: redemptions.length },
        'Listed redemptions',
      );

      return reply.status(200).send({ data: redemptions });
    },
  );

  // -------------------------------------------------------------------------
  // POST /entitlements/issue-manual - Manually issue an entitlement
  // -------------------------------------------------------------------------
  fastify.post(
    '/entitlements/issue-manual',
    {
      preHandler: [
        authenticate,
        authorize('entitlement:issue_manual'),
        validateBody(issueManualBodySchema),
      ],
    },
    async (request, reply) => {
      const entitlement = await entitlementsService.issueManual(
        request.user.userId,
        request.body,
      );

      log.info(
        { action: 'issueManual', entitlementId: entitlement.id },
        'Entitlement manually issued',
      );

      return reply.status(201).send({ data: entitlement });
    },
  );

  // -------------------------------------------------------------------------
  // POST /entitlements/bulk-import/validate - Validate a CSV file for bulk import
  // -------------------------------------------------------------------------
  fastify.post(
    '/entitlements/bulk-import/validate',
    {
      preHandler: [
        authenticate,
        authorize('entitlement:bulk_import'),
      ],
    },
    async (request, reply) => {
      // Handle multipart file upload
      const data = await request.file();
      if (!data) {
        return reply.status(422).send({
          code: 'VALIDATION_ERROR',
          message: 'No file uploaded',
          details: null,
          requestId: request.id,
        });
      }

      // Read the file content as text
      const chunks = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }
      const csvContent = Buffer.concat(chunks).toString('utf-8');

      // Validate the CSV
      const validationResult = await entitlementsService.validateBulkImport(csvContent);

      // If there are valid rows, create a pending batch for later confirmation
      let batchId = null;
      if (validationResult.valid.length > 0) {
        const batch = await entitlementsRepo.createBulkBatch({
          created_by: request.user.userId,
          status: 'pending',
          summary_json: {
            ...validationResult.summary,
            validRows: validationResult.valid,
          },
        });
        batchId = batch.id;
      }

      log.info(
        {
          action: 'validateBulkImport',
          validCount: validationResult.summary.validCount,
          errorCount: validationResult.summary.errorCount,
          batchId,
        },
        'Bulk import CSV validated',
      );

      return reply.status(200).send({
        data: {
          batch_id: batchId,
          valid: validationResult.valid,
          errors: validationResult.errors,
          summary: validationResult.summary,
        },
      });
    },
  );

  // -------------------------------------------------------------------------
  // POST /entitlements/bulk-import/confirm - Confirm a validated bulk import
  // -------------------------------------------------------------------------
  fastify.post(
    '/entitlements/bulk-import/confirm',
    {
      preHandler: [
        authenticate,
        authorize('entitlement:bulk_import'),
        validateBody(confirmBulkBodySchema),
      ],
    },
    async (request, reply) => {
      const { batch_id } = request.body;

      const { entitlements, batch } = await entitlementsService.confirmBulkImport(
        request.user.userId,
        batch_id,
      );

      log.info(
        { action: 'confirmBulkImport', batchId: batch_id, count: entitlements.length },
        'Bulk import confirmed',
      );

      return reply.status(201).send({
        data: {
          batch,
          entitlement_count: entitlements.length,
          entitlements,
        },
      });
    },
  );

  // -------------------------------------------------------------------------
  // POST /entitlements/:id/redeem - Redeem an entitlement (idempotent)
  // -------------------------------------------------------------------------
  fastify.post(
    '/entitlements/:id/redeem',
    {
      preHandler: [
        authenticate,
        authorize('entitlement:redeem'),
        validateParams(entitlementIdParamSchema),
        validateBody(redeemBodySchema),
      ],
    },
    async (request, reply) => {
      const { id } = request.params;
      const { quantity } = request.body;

      // Verify entitlement ownership
      const entitlement = await entitlementsRepo.findById(id);
      if (!entitlement) {
        throw new NotFoundError('Entitlement', id);
      }

      // Only the entitlement owner or privileged users can redeem
      const isOwner = entitlement.user_id === request.user.userId;
      const userPermissions = request.user.permissions || [];
      const isPrivileged = userPermissions.includes('entitlement:issue_manual') || userPermissions.includes('admin:roles');

      if (!isOwner && !isPrivileged) {
        throw new ForbiddenError('You can only redeem your own entitlements');
      }

      // Resolve idempotency key: header > body > generate
      let idempotencyKey = request.headers['idempotency-key']
        || request.body.idempotency_key
        || null;

      const wasGenerated = !idempotencyKey;
      if (!idempotencyKey) {
        idempotencyKey = randomUUID();
      }

      const result = await entitlementsService.redeem(
        request.user.userId,
        id,
        quantity,
        idempotencyKey,
        request.user.permissions || [],
      );

      log.info(
        {
          action: 'redeem',
          entitlementId: id,
          success: result.success,
          redemptionId: result.redemptionId,
        },
        result.success ? 'Entitlement redeemed' : 'Entitlement redemption failed',
      );

      const responseBody = {
        data: {
          success: result.success,
          redemption_id: result.redemptionId,
          remaining: result.remaining,
          idempotency_key: idempotencyKey,
        },
      };

      if (result.failureReason) {
        responseBody.data.failure_reason = result.failureReason;
      }

      // Include idempotency key in response header if it was generated
      if (wasGenerated) {
        reply.header('idempotency-key', idempotencyKey);
      }

      const statusCode = result.success ? 200 : 422;
      return reply.status(statusCode).send(responseBody);
    },
  );
}

export default entitlementsRoutes;
