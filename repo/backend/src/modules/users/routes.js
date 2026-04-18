/**
 * Users Routes
 *
 * Fastify plugin that registers user-related endpoints under the /users prefix.
 * All routes require JWT authentication.
 */

import { z } from 'zod';
import { createLogger } from '../../logging/index.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateQuery, validateParams, validateBody } from '../../middleware/validate.js';
import { parsePagination, formatPaginatedResponse } from '../../shared/pagination.js';
import { NotFoundError } from '../../shared/errors.js';
import * as usersRepo from './repository.js';

const log = createLogger('users:routes');

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  sortBy: z.enum(['username', 'status', 'created_at', 'updated_at']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional().default('asc'),
});

const userIdParamSchema = z.object({
  id: z.string().uuid(),
});

const updateStatusBodySchema = z.object({
  status: z.enum(['active', 'inactive', 'suspended']),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {object} _opts
 */
async function usersRoutes(fastify, _opts) {

  // -------------------------------------------------------------------------
  // GET /users - List users (admin only)
  // -------------------------------------------------------------------------
  fastify.get(
    '/users',
    {
      preHandler: [
        authenticate,
        authorize('admin:roles'),
        validateQuery(listUsersQuerySchema),
      ],
    },
    async (request, reply) => {
      const pagination = parsePagination(request.query);
      const { data, total } = await usersRepo.findAll(pagination);

      log.info(
        { action: 'list', page: pagination.page, total },
        'Listed users',
      );

      return reply.status(200).send(formatPaginatedResponse(data, total, pagination));
    },
  );

  // -------------------------------------------------------------------------
  // GET /users/:id - Get user by ID (self or admin)
  // -------------------------------------------------------------------------
  fastify.get(
    '/users/:id',
    {
      preHandler: [
        authenticate,
        validateParams(userIdParamSchema),
      ],
    },
    async (request, reply) => {
      const { id } = request.params;

      // Allow access if the requester is the same user, or has admin:roles
      const isSelf = request.user.userId === id;
      const isAdmin = (request.user.permissions || []).includes('admin:roles');

      if (!isSelf && !isAdmin) {
        return reply.status(403).send({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
          details: null,
          requestId: request.id,
        });
      }

      const user = await usersRepo.findById(id);
      if (!user) {
        throw new NotFoundError('User', id);
      }

      log.info({ action: 'getById', userId: id }, 'Retrieved user by id');

      return reply.status(200).send({ data: user });
    },
  );

  // -------------------------------------------------------------------------
  // PATCH /users/:id/status - Update user status (admin only)
  // -------------------------------------------------------------------------
  fastify.patch(
    '/users/:id/status',
    {
      preHandler: [
        authenticate,
        authorize('admin:roles'),
        validateParams(userIdParamSchema),
        validateBody(updateStatusBodySchema),
      ],
    },
    async (request, reply) => {
      const { id } = request.params;
      const { status } = request.body;

      const updated = await usersRepo.updateStatus(id, status);
      if (!updated) {
        throw new NotFoundError('User', id);
      }

      log.info(
        { action: 'updateStatus', userId: id, status },
        `User status updated to ${status}`,
      );

      return reply.status(200).send({ data: updated });
    },
  );
}

export default usersRoutes;
