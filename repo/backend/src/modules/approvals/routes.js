/**
 * Approvals Routes
 *
 * Fastify plugin that registers approval-related endpoints under the /approvals prefix.
 * All routes require JWT authentication.
 */

import { z } from 'zod';
import { createLogger } from '../../logging/index.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validateBody, validateQuery, validateParams } from '../../middleware/validate.js';
import { parsePagination, formatPaginatedResponse } from '../../shared/pagination.js';
import { NotFoundError } from '../../shared/errors.js';
import * as approvalsService from './service.js';
import * as approvalsRepo from './repository.js';

const log = createLogger('approvals:routes');

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const pendingApprovalsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  approval_type: z.enum([
    'budget_override',
    'budget_change',
    'special_resource',
    'quota_override',
    'overtime',
  ]).optional(),
});

const approvalIdParamSchema = z.object({
  id: z.string().uuid(),
});

const approveRejectBodySchema = z.object({
  justification: z.string().max(2000).optional(),
});

// ---------------------------------------------------------------------------
// Permission mapping by approval type
// ---------------------------------------------------------------------------

/**
 * Map approval types to the permission required to act on them.
 */
const APPROVAL_TYPE_PERMISSIONS = {
  budget_override: 'event:approve',
  budget_change: 'event:approve',
  special_resource: 'resource:approve_special',
  quota_override: 'resource:quota_override',
  overtime: 'reservation:overtime_approve',
};

/**
 * Check whether the user has permission to act on a specific approval.
 *
 * @param {object} user     - request.user
 * @param {object} approval - the approval record
 * @returns {boolean}
 */
function canActOnApproval(user, approval) {
  const requiredPerm = APPROVAL_TYPE_PERMISSIONS[approval.approval_type];
  if (!requiredPerm) return false;
  const userPerms = user.permissions || [];
  return userPerms.includes(requiredPerm);
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {object} _opts
 */
async function approvalsRoutes(fastify, _opts) {

  // -------------------------------------------------------------------------
  // GET /approvals/pending - List pending approvals
  // -------------------------------------------------------------------------
  fastify.get(
    '/approvals/pending',
    {
      preHandler: [
        authenticate,
        validateQuery(pendingApprovalsQuerySchema),
      ],
    },
    async (request, reply) => {
      const pagination = parsePagination(request.query);
      const { approval_type } = request.query;

      const { data, total } = await approvalsRepo.findPending({
        ...pagination,
        approvalType: approval_type,
      });

      // Filter to only show approvals the user has permission to act on
      const userPerms = request.user.permissions || [];
      const filtered = data.filter((approval) => {
        const requiredPerm = APPROVAL_TYPE_PERMISSIONS[approval.approval_type];
        return requiredPerm && userPerms.includes(requiredPerm);
      });

      log.info(
        { action: 'listPending', page: pagination.page, total: filtered.length },
        'Listed pending approvals',
      );

      return reply.status(200).send(formatPaginatedResponse(filtered, total, pagination));
    },
  );

  // -------------------------------------------------------------------------
  // POST /approvals/:id/approve - Approve an approval
  // -------------------------------------------------------------------------
  fastify.post(
    '/approvals/:id/approve',
    {
      preHandler: [
        authenticate,
        validateParams(approvalIdParamSchema),
        validateBody(approveRejectBodySchema),
      ],
    },
    async (request, reply) => {
      const { id: approvalId } = request.params;

      // Verify approval exists and user has the right permission
      const approval = await approvalsRepo.findById(approvalId);
      if (!approval) {
        throw new NotFoundError('Approval', approvalId);
      }

      if (!canActOnApproval(request.user, approval)) {
        return reply.status(403).send({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions to approve this type of approval',
          details: {
            approval_type: approval.approval_type,
            required: APPROVAL_TYPE_PERMISSIONS[approval.approval_type],
          },
          requestId: request.id,
        });
      }

      const { justification } = request.body || {};

      const updated = await approvalsService.approveApproval(
        request.user.userId,
        approvalId,
        justification,
      );

      log.info(
        { action: 'approve', approvalId, type: approval.approval_type },
        `Approval ${approvalId} approved`,
      );

      return reply.status(200).send({ data: updated });
    },
  );

  // -------------------------------------------------------------------------
  // POST /approvals/:id/reject - Reject an approval
  // -------------------------------------------------------------------------
  fastify.post(
    '/approvals/:id/reject',
    {
      preHandler: [
        authenticate,
        validateParams(approvalIdParamSchema),
        validateBody(approveRejectBodySchema),
      ],
    },
    async (request, reply) => {
      const { id: approvalId } = request.params;

      // Verify approval exists and user has the right permission
      const approval = await approvalsRepo.findById(approvalId);
      if (!approval) {
        throw new NotFoundError('Approval', approvalId);
      }

      if (!canActOnApproval(request.user, approval)) {
        return reply.status(403).send({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions to reject this type of approval',
          details: {
            approval_type: approval.approval_type,
            required: APPROVAL_TYPE_PERMISSIONS[approval.approval_type],
          },
          requestId: request.id,
        });
      }

      const { justification } = request.body || {};

      const updated = await approvalsService.rejectApproval(
        request.user.userId,
        approvalId,
        justification,
      );

      log.info(
        { action: 'reject', approvalId, type: approval.approval_type },
        `Approval ${approvalId} rejected`,
      );

      return reply.status(200).send({ data: updated });
    },
  );
}

export default approvalsRoutes;
