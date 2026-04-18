/**
 * Users Repository
 *
 * Database access layer for user-related operations.
 * All functions return plain objects (no ORM models).
 *
 * Sensitive PII fields (employee_id, phone_number, email) are encrypted
 * at rest with AES-256-GCM via shared/encryption.js and returned as
 * masked plaintext from read paths so API responses never leak raw PII.
 */

import db from '../../db/connection.js';
import { createLogger } from '../../logging/index.js';
import { encrypt, decrypt, maskField } from '../../shared/encryption.js';

const log = createLogger('users:repository');

// ---------------------------------------------------------------------------
// Allowed sort columns for the paginated list query
// ---------------------------------------------------------------------------
const ALLOWED_SORTS = ['username', 'status', 'created_at', 'updated_at'];

// ---------------------------------------------------------------------------
// Sensitive-field encryption helpers
// ---------------------------------------------------------------------------

const SENSITIVE_FIELDS = [
  { plain: 'employee_id', column: 'employee_id_enc', maskType: 'employee_id' },
  { plain: 'phone_number', column: 'phone_number_enc', maskType: 'phone' },
  { plain: 'email', column: 'email_enc', maskType: 'email' },
];

/**
 * Encrypt provided sensitive fields, returning a DB-column payload.
 *
 * @param {object} input - Object optionally containing employee_id, phone_number, email
 * @returns {object} Column payload keyed by *_enc column name
 */
function encryptSensitive(input) {
  const payload = {};
  for (const { plain, column } of SENSITIVE_FIELDS) {
    if (input[plain] !== undefined && input[plain] !== null && input[plain] !== '') {
      payload[column] = encrypt(String(input[plain]));
    }
  }
  return payload;
}

/**
 * Given a raw user row that may include *_enc columns, return a copy with
 * masked plaintext values on the unencrypted field names (employee_id,
 * phone_number, email) and the *_enc columns removed.
 *
 * @param {object} row
 * @returns {object}
 */
function decryptAndMask(row) {
  const out = { ...row };
  for (const { plain, column, maskType } of SENSITIVE_FIELDS) {
    const cipher = out[column];
    delete out[column];
    if (cipher) {
      try {
        out[plain] = maskField(decrypt(cipher), maskType);
      } catch (err) {
        log.warn(
          { action: 'decrypt', field: column, err: err.message },
          'Failed to decrypt sensitive field',
        );
        out[plain] = null;
      }
    }
  }
  return out;
}

/**
 * Create a user row, encrypting any provided sensitive fields.
 *
 * @param {object} data
 * @param {string} data.id
 * @param {string} data.username
 * @param {string} data.password_hash
 * @param {string} [data.status]
 * @param {string} [data.employee_id]
 * @param {string} [data.phone_number]
 * @param {string} [data.email]
 * @returns {Promise<object>} Inserted row (with masked sensitive fields)
 */
export async function createUser(data) {
  log.info({ action: 'createUser', username: data.username }, 'Creating user');

  const insertPayload = {
    id: data.id,
    username: data.username,
    password_hash: data.password_hash,
    status: data.status || 'active',
    ...encryptSensitive(data),
  };

  const [row] = await db('users').insert(insertPayload).returning('*');
  return decryptAndMask(row);
}

/**
 * Update the sensitive PII fields on a user. Pass an explicit `null` to
 * clear a field; omit it to leave the stored value unchanged.
 *
 * @param {string} id - User UUID
 * @param {object} updates - { employee_id?, phone_number?, email? }
 * @returns {Promise<object|null>} Updated user row (masked) or null if not found
 */
export async function updateSensitive(id, updates) {
  log.info({ action: 'updateSensitive', id }, 'Updating sensitive user fields');

  const payload = {};
  for (const { plain, column } of SENSITIVE_FIELDS) {
    if (plain in updates) {
      const v = updates[plain];
      if (v === null || v === '') {
        payload[column] = null;
      } else {
        payload[column] = encrypt(String(v));
      }
    }
  }
  if (Object.keys(payload).length === 0) {
    return findById(id);
  }
  payload.updated_at = db.fn.now();

  const [row] = await db('users').where({ id }).update(payload).returning('*');
  if (!row) return null;

  const roles = await getUserRoles(id);
  const permissions = await getUserPermissions(id);
  return { ...decryptAndMask(row), roles, permissions };
}

/**
 * Find a user by ID, including their roles and aggregated permissions.
 *
 * Sensitive fields (employee_id, phone_number, email) are decrypted and
 * returned masked so callers can never see raw PII through this API.
 *
 * @param {string} id - User UUID
 * @returns {Promise<object|null>} User record with `roles` and `permissions` arrays, or null
 */
export async function findById(id) {
  log.debug({ action: 'findById', id }, 'Looking up user by id');

  const user = await db('users')
    .select(
      'users.id',
      'users.username',
      'users.status',
      'users.employee_id_enc',
      'users.phone_number_enc',
      'users.email_enc',
      'users.created_at',
      'users.updated_at',
    )
    .where('users.id', id)
    .first();

  if (!user) return null;

  const roles = await getUserRoles(user.id);
  const permissions = await getUserPermissions(user.id);

  return { ...decryptAndMask(user), roles, permissions };
}

/**
 * Find a user by username.
 *
 * Returns the raw row including password_hash and *_enc columns for auth
 * flows; callers rendering API responses must run the result through a
 * masking step first.
 *
 * @param {string} username
 * @returns {Promise<object|null>} Raw user record (includes password_hash), or null
 */
export async function findByUsername(username) {
  log.debug({ action: 'findByUsername', username }, 'Looking up user by username');

  return db('users').where({ username }).first();
}

/**
 * Return a paginated list of users with their roles.
 *
 * @param {object}  opts
 * @param {number}  opts.page
 * @param {number}  opts.pageSize
 * @param {string}  [opts.sortBy]
 * @param {'asc'|'desc'} [opts.sortDir]
 * @returns {Promise<{ data: object[], total: number }>}
 */
export async function findAll({ page = 1, pageSize = 20, sortBy, sortDir = 'asc' }) {
  log.debug({ action: 'findAll', page, pageSize, sortBy, sortDir }, 'Listing users');

  // Count total rows
  const [{ count }] = await db('users').count('id as count');
  const total = Number(count);

  // Build paginated query
  let query = db('users').select(
    'id',
    'username',
    'status',
    'employee_id_enc',
    'phone_number_enc',
    'email_enc',
    'created_at',
    'updated_at',
  );

  if (sortBy && ALLOWED_SORTS.includes(sortBy)) {
    query = query.orderBy(sortBy, sortDir);
  } else {
    query = query.orderBy('created_at', 'desc');
  }

  const offset = (page - 1) * pageSize;
  const rawUsers = await query.limit(pageSize).offset(offset);
  const users = rawUsers.map((u) => decryptAndMask(u));

  // Attach roles to each user
  const userIds = users.map((u) => u.id);
  if (userIds.length > 0) {
    const userRoleRows = await db('user_roles')
      .join('roles', 'roles.id', 'user_roles.role_id')
      .whereIn('user_roles.user_id', userIds)
      .select('user_roles.user_id', 'roles.id as role_id', 'roles.name as role_name');

    const rolesByUser = {};
    for (const row of userRoleRows) {
      if (!rolesByUser[row.user_id]) rolesByUser[row.user_id] = [];
      rolesByUser[row.user_id].push({ id: row.role_id, name: row.role_name });
    }

    for (const user of users) {
      user.roles = rolesByUser[user.id] || [];
    }
  }

  return { data: users, total };
}

/**
 * Update a user's status.
 *
 * @param {string} id     - User UUID
 * @param {string} status - New status ('active' | 'inactive' | 'suspended')
 * @returns {Promise<object|null>} Updated user record or null if not found
 */
export async function updateStatus(id, status) {
  log.info({ action: 'updateStatus', id, status }, 'Updating user status');

  const [updated] = await db('users')
    .where({ id })
    .update({ status, updated_at: db.fn.now() })
    .returning(['id', 'username', 'status', 'created_at', 'updated_at']);

  return updated || null;
}

/**
 * Get all roles assigned to a user.
 *
 * @param {string} userId - User UUID
 * @returns {Promise<Array<{ id: string, name: string }>>}
 */
export async function getUserRoles(userId) {
  return db('user_roles')
    .join('roles', 'roles.id', 'user_roles.role_id')
    .where('user_roles.user_id', userId)
    .select('roles.id', 'roles.name');
}

/**
 * Get all permission codes for a user by traversing
 * user_roles -> role_permissions -> permissions.
 *
 * @param {string} userId - User UUID
 * @returns {Promise<string[]>} Array of unique permission code strings
 */
export async function getUserPermissions(userId) {
  const rows = await db('user_roles')
    .join('role_permissions', 'role_permissions.role_id', 'user_roles.role_id')
    .join('permissions', 'permissions.id', 'role_permissions.permission_id')
    .where('user_roles.user_id', userId)
    .distinct('permissions.code')
    .select('permissions.code');

  return rows.map((r) => r.code);
}
