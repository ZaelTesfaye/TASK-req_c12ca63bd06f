/**
 * Roles / Admin Routes
 *
 * Fastify plugin that registers admin-level endpoints for managing
 * user roles and manager event scopes under the /admin prefix.
 * All routes require JWT authentication + appropriate permissions.
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createLogger } from '../../logging/index.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { NotFoundError, ConflictError } from '../../shared/errors.js';
import { writeAudit } from '../../shared/audit.js';
import db from '../../db/connection.js';
import * as rolesRepo from './repository.js';

const log = createLogger('roles:routes');

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const userIdParamSchema = z.object({
  id: z.string().uuid(),
});

const userIdAndRoleIdParamSchema = z.object({
  id: z.string().uuid(),
  roleId: z.string().uuid(),
});

const userIdAndEventIdParamSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
});

const assignRoleBodySchema = z.object({
  roleName: z.string().min(1).max(50),
});

const assignManagerScopeBodySchema = z.object({
  eventId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {object} _opts
 */
async function rolesRoutes(fastify, _opts) {

  // -------------------------------------------------------------------------
  // GET /admin/roles - List all roles
  // -------------------------------------------------------------------------
  fastify.get(
    '/admin/roles',
    {
      preHandler: [
        authenticate,
        authorize('admin:roles'),
      ],
    },
    async (request, reply) => {
      const roles = await rolesRepo.findAll();

      log.info({ action: 'listRoles', count: roles.length }, 'Listed all roles');

      return reply.status(200).send({ data: roles });
    },
  );

  // -------------------------------------------------------------------------
  // POST /admin/users/:id/roles - Assign a role to a user
  // -------------------------------------------------------------------------
  fastify.post(
    '/admin/users/:id/roles',
    {
      preHandler: [
        authenticate,
        authorize('admin:roles'),
        validateParams(userIdParamSchema),
        validateBody(assignRoleBodySchema),
      ],
    },
    async (request, reply) => {
      const { id: userId } = request.params;
      const { roleName } = request.body;

      // Verify user exists
      const user = await db('users').where({ id: userId }).first();
      if (!user) {
        throw new NotFoundError('User', userId);
      }

      // Verify role exists
      const role = await rolesRepo.findByName(roleName);
      if (!role) {
        throw new NotFoundError('Role', roleName);
      }

      // Check if assignment already exists
      const existing = await db('user_roles')
        .where({ user_id: userId, role_id: role.id })
        .first();

      if (existing) {
        throw new ConflictError(`User already has role '${roleName}'`, {
          userId,
          roleName,
        });
      }

      // Assign the role
      await rolesRepo.assignRole(userId, role.id);

      // Write audit trail
      await writeAudit({
        eventId: null,
        subjectType: 'user_role',
        subjectId: userId,
        action: 'assign_role',
        actorUserId: request.user.userId,
        before: null,
        after: { userId, roleId: role.id, roleName },
        notes: `Assigned role '${roleName}' to user ${userId}`,
      });

      log.info(
        { action: 'assignRole', userId, roleName },
        `Role '${roleName}' assigned to user`,
      );

      return reply.status(201).send({
        data: { userId, roleId: role.id, roleName },
      });
    },
  );

  // -------------------------------------------------------------------------
  // DELETE /admin/users/:id/roles/:roleId - Remove a role from a user
  // -------------------------------------------------------------------------
  fastify.delete(
    '/admin/users/:id/roles/:roleId',
    {
      preHandler: [
        authenticate,
        authorize('admin:roles'),
        validateParams(userIdAndRoleIdParamSchema),
      ],
    },
    async (request, reply) => {
      const { id: userId, roleId } = request.params;

      // Attempt removal
      const deletedCount = await rolesRepo.removeRole(userId, roleId);
      if (deletedCount === 0) {
        throw new NotFoundError('UserRole', `${userId}/${roleId}`);
      }

      // Write audit trail
      await writeAudit({
        eventId: null,
        subjectType: 'user_role',
        subjectId: userId,
        action: 'remove_role',
        actorUserId: request.user.userId,
        before: { userId, roleId },
        after: null,
        notes: `Removed role ${roleId} from user ${userId}`,
      });

      log.info(
        { action: 'removeRole', userId, roleId },
        'Role removed from user',
      );

      return reply.status(200).send({
        message: 'Role removed successfully',
      });
    },
  );

  // -------------------------------------------------------------------------
  // POST /admin/users/:id/manager-scopes - Assign manager event scope
  // -------------------------------------------------------------------------
  fastify.post(
    '/admin/users/:id/manager-scopes',
    {
      preHandler: [
        authenticate,
        authorize('admin:manager_scope'),
        validateParams(userIdParamSchema),
        validateBody(assignManagerScopeBodySchema),
      ],
    },
    async (request, reply) => {
      const { id: userId } = request.params;
      const { eventId } = request.body;

      // Verify user exists
      const user = await db('users').where({ id: userId }).first();
      if (!user) {
        throw new NotFoundError('User', userId);
      }

      // Verify event exists
      const event = await db('events').where({ id: eventId }).first();
      if (!event) {
        throw new NotFoundError('Event', eventId);
      }

      // Check for existing scope
      const existing = await db('manager_event_scopes')
        .where({ user_id: userId, event_id: eventId })
        .first();

      if (existing) {
        throw new ConflictError('Manager scope already exists for this user and event', {
          userId,
          eventId,
        });
      }

      // Insert the scope
      const [scope] = await db('manager_event_scopes')
        .insert({
          user_id: userId,
          event_id: eventId,
          assigned_by: request.user.userId,
        })
        .returning(['id', 'user_id', 'event_id', 'assigned_by', 'created_at']);

      // Write audit trail
      await writeAudit({
        eventId: null,
        subjectType: 'manager_event_scope',
        subjectId: scope.id,
        action: 'assign_scope',
        actorUserId: request.user.userId,
        before: null,
        after: { userId, eventId, assignedBy: request.user.userId },
        notes: `Assigned manager scope for event ${eventId} to user ${userId}`,
      });

      log.info(
        { action: 'assignManagerScope', userId, eventId },
        'Manager event scope assigned',
      );

      return reply.status(201).send({ data: scope });
    },
  );

  // -------------------------------------------------------------------------
  // DELETE /admin/users/:id/manager-scopes/:eventId - Remove manager scope
  // -------------------------------------------------------------------------
  fastify.delete(
    '/admin/users/:id/manager-scopes/:eventId',
    {
      preHandler: [
        authenticate,
        authorize('admin:manager_scope'),
        validateParams(userIdAndEventIdParamSchema),
      ],
    },
    async (request, reply) => {
      const { id: userId, eventId } = request.params;

      const deletedCount = await db('manager_event_scopes')
        .where({ user_id: userId, event_id: eventId })
        .del();

      if (deletedCount === 0) {
        throw new NotFoundError('ManagerEventScope', `${userId}/${eventId}`);
      }

      // Write audit trail
      await writeAudit({
        eventId: null,
        subjectType: 'manager_event_scope',
        subjectId: userId,
        action: 'remove_scope',
        actorUserId: request.user.userId,
        before: { userId, eventId },
        after: null,
        notes: `Removed manager scope for event ${eventId} from user ${userId}`,
      });

      log.info(
        { action: 'removeManagerScope', userId, eventId },
        'Manager event scope removed',
      );

      return reply.status(200).send({
        message: 'Manager scope removed successfully',
      });
    },
  );

  // -------------------------------------------------------------------------
  // GET /admin/users/:id/manager-scopes - List scopes for a user
  // -------------------------------------------------------------------------
  fastify.get(
    '/admin/users/:id/manager-scopes',
    {
      preHandler: [
        authenticate,
        authorize('admin:manager_scope'),
        validateParams(userIdParamSchema),
      ],
    },
    async (request, reply) => {
      const { id: userId } = request.params;

      // Verify user exists
      const user = await db('users').where({ id: userId }).first();
      if (!user) {
        throw new NotFoundError('User', userId);
      }

      const scopes = await db('manager_event_scopes')
        .join('events', 'events.id', 'manager_event_scopes.event_id')
        .where('manager_event_scopes.user_id', userId)
        .select(
          'manager_event_scopes.id',
          'manager_event_scopes.event_id',
          'events.title as event_title',
          'manager_event_scopes.assigned_by',
          'manager_event_scopes.created_at',
        );

      log.info(
        { action: 'listManagerScopes', userId, count: scopes.length },
        'Listed manager event scopes',
      );

      return reply.status(200).send({ data: scopes });
    },
  );
}

export default rolesRoutes;
