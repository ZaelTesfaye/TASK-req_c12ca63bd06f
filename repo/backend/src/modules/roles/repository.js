/**
 * Roles Repository
 *
 * Database access layer for role and permission management.
 */

import db from '../../db/connection.js';
import { createLogger } from '../../logging/index.js';

const log = createLogger('roles:repository');

/**
 * List all roles.
 *
 * @returns {Promise<Array<{ id: string, name: string }>>}
 */
export async function findAll() {
  log.debug({ action: 'findAll' }, 'Listing all roles');

  return db('roles').select('id', 'name').orderBy('name', 'asc');
}

/**
 * Find a role by its name.
 *
 * @param {string} name - Role name (e.g. 'admin', 'event_planner')
 * @returns {Promise<object|null>}
 */
export async function findByName(name) {
  log.debug({ action: 'findByName', name }, 'Looking up role by name');

  return db('roles').where({ name }).first();
}

/**
 * Assign a role to a user (insert into user_roles junction table).
 *
 * @param {string} userId - User UUID
 * @param {string} roleId - Role UUID
 * @returns {Promise<void>}
 */
export async function assignRole(userId, roleId) {
  log.info({ action: 'assignRole', userId, roleId }, 'Assigning role to user');

  await db('user_roles').insert({ user_id: userId, role_id: roleId });
}

/**
 * Remove a role from a user (delete from user_roles junction table).
 *
 * @param {string} userId - User UUID
 * @param {string} roleId - Role UUID
 * @returns {Promise<number>} Number of deleted rows (0 or 1)
 */
export async function removeRole(userId, roleId) {
  log.info({ action: 'removeRole', userId, roleId }, 'Removing role from user');

  return db('user_roles')
    .where({ user_id: userId, role_id: roleId })
    .del();
}

/**
 * Get all permissions for a given role.
 *
 * @param {string} roleId - Role UUID
 * @returns {Promise<Array<{ id: string, code: string }>>}
 */
export async function getRolePermissions(roleId) {
  log.debug({ action: 'getRolePermissions', roleId }, 'Listing permissions for role');

  return db('role_permissions')
    .join('permissions', 'permissions.id', 'role_permissions.permission_id')
    .where('role_permissions.role_id', roleId)
    .select('permissions.id', 'permissions.code');
}
