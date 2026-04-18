/**
 * Audit Routes
 *
 * Fastify plugin that registers admin-level audit trail query endpoints.
 * The audit trail is read-only (inserts only, no updates/deletes).
 * Event-specific audit trails are accessible via /events/:id/audit-trail.
 * This module provides a generic admin query interface.
 */

import { z } from 'zod';
import db from '../../db/connection.js';
import { createLogger } from '../../logging/index.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateQuery } from '../../middleware/validate.js';
import { parsePagination, formatPaginatedResponse } from '../../shared/pagination.js';

const log = createLogger('audit:routes');

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  subject_type: z.string().max(50).optional(),
  subject_id: z.string().uuid().optional(),
  actor_user_id: z.string().uuid().optional(),
  action: z.string().max(50).optional(),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {object} _opts
 */
async function auditRoutes(fastify, _opts) {

  // -------------------------------------------------------------------------
  // GET /admin/audit-trail - Query audit trail (admin only)
  // -------------------------------------------------------------------------
  fastify.get(
    '/admin/audit-trail',
    {
      preHandler: [
        authenticate,
        authorize('admin:audit'),
        validateQuery(auditQuerySchema),
      ],
    },
    async (request, reply) => {
      const pagination = parsePagination(request.query);
      const {
        subject_type,
        subject_id,
        actor_user_id,
        action,
        from_date,
        to_date,
      } = request.query;

      let countQuery = db('audit_trail');
      let dataQuery = db('audit_trail')
        .leftJoin('users', 'users.id', 'audit_trail.actor_user_id')
        .select(
          'audit_trail.*',
          'users.username as actor_username',
        );

      if (subject_type) {
        countQuery = countQuery.where('subject_type', subject_type);
        dataQuery = dataQuery.where('audit_trail.subject_type', subject_type);
      }
      if (subject_id) {
        countQuery = countQuery.where('subject_id', subject_id);
        dataQuery = dataQuery.where('audit_trail.subject_id', subject_id);
      }
      if (actor_user_id) {
        countQuery = countQuery.where('actor_user_id', actor_user_id);
        dataQuery = dataQuery.where('audit_trail.actor_user_id', actor_user_id);
      }
      if (action) {
        countQuery = countQuery.where('action', action);
        dataQuery = dataQuery.where('audit_trail.action', action);
      }
      if (from_date) {
        countQuery = countQuery.where('created_at', '>=', from_date);
        dataQuery = dataQuery.where('audit_trail.created_at', '>=', from_date);
      }
      if (to_date) {
        countQuery = countQuery.where('created_at', '<=', `${to_date}T23:59:59.999Z`);
        dataQuery = dataQuery.where('audit_trail.created_at', '<=', `${to_date}T23:59:59.999Z`);
      }

      const [{ count }] = await countQuery.count('id as count');
      const total = Number(count);

      const offset = (pagination.page - 1) * pagination.pageSize;
      const data = await dataQuery
        .orderBy('audit_trail.created_at', 'desc')
        .limit(pagination.pageSize)
        .offset(offset);

      log.info(
        { action: 'queryAudit', page: pagination.page, total },
        'Queried audit trail',
      );

      return reply.status(200).send(formatPaginatedResponse(data, total, pagination));
    },
  );
}

export default auditRoutes;
