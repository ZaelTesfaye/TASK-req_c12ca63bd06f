/**
 * Auth Routes — Fastify Plugin
 *
 * Prefix: /auth
 *
 * Endpoints:
 *   POST /auth/register  — Create a new user account
 *   POST /auth/login     — Authenticate and receive tokens
 *   POST /auth/refresh   — Rotate refresh token and get new access token
 *   POST /auth/logout    — Revoke all refresh tokens for the user
 *   GET  /auth/me        — Return authenticated user profile
 */

import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { z } from 'zod';
import config from '../config/index.js';
import { createLogger } from '../logging/index.js';
import db from '../db/connection.js';
import { authenticate } from '../middleware/authenticate.js';
import { writeAudit } from '../shared/audit.js';
import * as usersRepo from '../modules/users/repository.js';

const log = createLogger('auth');

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const registerSchema = z.object({
  username: z.string().min(3).max(100),
  password: z.string().min(8).max(128),
  employee_id: z.string().min(1).max(100).optional(),
  phone_number: z.string().min(1).max(50).optional(),
  email: z.string().email().max(254).optional(),
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Hash a raw refresh token with SHA-256 for storage.
 * @param {string} raw - The raw UUID refresh token
 * @returns {string} Hex-encoded SHA-256 hash
 */
function hashRefreshToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Fetch roles (names) and permissions (codes) for a given user.
 * @param {string} userId
 * @returns {Promise<{ roles: string[], permissions: string[] }>}
 */
async function fetchUserRolesAndPermissions(userId) {
  const roles = await db('user_roles')
    .join('roles', 'user_roles.role_id', 'roles.id')
    .where('user_roles.user_id', userId)
    .select('roles.name');

  const roleNames = roles.map((r) => r.name);

  if (roleNames.length === 0) {
    return { roles: [], permissions: [] };
  }

  const roleIds = await db('roles')
    .whereIn('name', roleNames)
    .select('id');

  const permissions = await db('role_permissions')
    .join('permissions', 'role_permissions.permission_id', 'permissions.id')
    .whereIn(
      'role_permissions.role_id',
      roleIds.map((r) => r.id)
    )
    .select('permissions.code')
    .distinct();

  return {
    roles: roleNames,
    permissions: permissions.map((p) => p.code),
  };
}

/**
 * Generate a JWT access token and a hashed refresh token for the given user.
 * Stores the refresh token hash in the database.
 *
 * @param {object} user - User row from the database
 * @returns {Promise<{ accessToken: string, refreshToken: string, expiresIn: number }>}
 */
async function generateTokens(user) {
  const { roles, permissions } = await fetchUserRolesAndPermissions(user.id);

  const expiresInSeconds = config.jwt.accessTtlMinutes * 60;

  const accessToken = jwt.sign(
    {
      userId: user.id,
      username: user.username,
      roles,
      permissions,
    },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessTtlMinutes + 'm' }
  );

  const rawRefreshToken = uuidv4();
  const tokenHash = hashRefreshToken(rawRefreshToken);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + config.jwt.refreshTtlDays);

  await db('refresh_tokens').insert({
    id: uuidv4(),
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
    rotated_from_id: null,
    revoked_at: null,
  });

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    expiresIn: expiresInSeconds,
  };
}

/**
 * Generate tokens with rotation — creates a new refresh token that points
 * back to the old one for audit purposes.
 *
 * @param {object} user - User row from the database
 * @param {string} oldTokenId - ID of the refresh token being rotated
 * @returns {Promise<{ accessToken: string, refreshToken: string, expiresIn: number }>}
 */
async function generateTokensWithRotation(user, oldTokenId) {
  const { roles, permissions } = await fetchUserRolesAndPermissions(user.id);

  const expiresInSeconds = config.jwt.accessTtlMinutes * 60;

  const accessToken = jwt.sign(
    {
      userId: user.id,
      username: user.username,
      roles,
      permissions,
    },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessTtlMinutes + 'm' }
  );

  const rawRefreshToken = uuidv4();
  const tokenHash = hashRefreshToken(rawRefreshToken);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + config.jwt.refreshTtlDays);

  await db('refresh_tokens').insert({
    id: uuidv4(),
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
    rotated_from_id: oldTokenId,
    revoked_at: null,
  });

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    expiresIn: expiresInSeconds,
  };
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * Fastify plugin that registers auth routes under the /auth prefix.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {object} _opts
 */
async function authRoutes(app, _opts) {
  // -----------------------------------------------------------------------
  // POST /auth/register
  // -----------------------------------------------------------------------
  app.post('/register', async (request, reply) => {
    const parseResult = registerSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(422).send({
        code: 'VALIDATION_ERROR',
        message: 'Request body validation failed',
        details: {
          errors: parseResult.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
        requestId: request.id,
      });
    }

    const { username, password, employee_id, phone_number, email } = parseResult.data;

    // Check uniqueness
    const existing = await db('users').where({ username }).first();
    if (existing) {
      return reply.status(409).send({
        code: 'CONFLICT',
        message: 'Username already exists',
        details: null,
        requestId: request.id,
      });
    }

    // Hash password with argon2id
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    // Insert user — sensitive PII fields are encrypted at rest by the repo.
    const userId = uuidv4();
    await usersRepo.createUser({
      id: userId,
      username,
      password_hash: passwordHash,
      status: 'active',
      employee_id,
      phone_number,
      email,
    });

    // Assign default role: event_planner
    const defaultRole = await db('roles').where({ name: 'event_planner' }).first();
    if (defaultRole) {
      await db('user_roles').insert({
        user_id: userId,
        role_id: defaultRole.id,
      });
    }

    const { roles } = await fetchUserRolesAndPermissions(userId);

    // Write audit trail
    try {
      await writeAudit({
        eventId: null,
        subjectType: 'user',
        subjectId: userId,
        action: 'register',
        actorUserId: userId,
        after: { id: userId, username, status: 'active', roles },
        notes: 'User self-registered',
      });
    } catch {
      // Audit failure logged internally; do not block registration
    }

    log.info({ action: 'register', userId, username }, 'User registered');

    return reply.status(201).send({
      user: {
        id: userId,
        username,
        status: 'active',
        roles,
      },
    });
  });

  // -----------------------------------------------------------------------
  // POST /auth/login
  // -----------------------------------------------------------------------
  app.post('/login', async (request, reply) => {
    const parseResult = loginSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(422).send({
        code: 'VALIDATION_ERROR',
        message: 'Request body validation failed',
        details: {
          errors: parseResult.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
        requestId: request.id,
      });
    }

    const { username, password } = parseResult.data;

    // Find user
    const user = await db('users').where({ username }).first();
    if (!user) {
      return reply.status(401).send({
        code: 'UNAUTHORIZED',
        message: 'Invalid credentials',
        details: null,
        requestId: request.id,
      });
    }

    // Check status
    if (user.status !== 'active') {
      return reply.status(403).send({
        code: 'FORBIDDEN',
        message: 'Account is not active',
        details: null,
        requestId: request.id,
      });
    }

    // Verify password
    const valid = await argon2.verify(user.password_hash, password);
    if (!valid) {
      return reply.status(401).send({
        code: 'UNAUTHORIZED',
        message: 'Invalid credentials',
        details: null,
        requestId: request.id,
      });
    }

    // Generate tokens
    const tokens = await generateTokens(user);
    const { roles, permissions } = await fetchUserRolesAndPermissions(user.id);

    log.info({ action: 'login', userId: user.id, username }, 'User logged in');

    return reply.send({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      user: {
        id: user.id,
        username: user.username,
        roles,
        permissions,
      },
    });
  });

  // -----------------------------------------------------------------------
  // POST /auth/refresh
  // -----------------------------------------------------------------------
  app.post('/refresh', async (request, reply) => {
    const parseResult = refreshSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(422).send({
        code: 'VALIDATION_ERROR',
        message: 'Request body validation failed',
        details: {
          errors: parseResult.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
        requestId: request.id,
      });
    }

    const { refreshToken } = parseResult.data;
    const tokenHash = hashRefreshToken(refreshToken);

    // Find token that is not revoked and not expired
    const storedToken = await db('refresh_tokens')
      .where({ token_hash: tokenHash })
      .whereNull('revoked_at')
      .where('expires_at', '>', new Date())
      .first();

    if (!storedToken) {
      return reply.status(401).send({
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired refresh token',
        details: null,
        requestId: request.id,
      });
    }

    // Revoke old token
    await db('refresh_tokens')
      .where({ id: storedToken.id })
      .update({ revoked_at: new Date() });

    // Fetch user for new token generation
    const user = await db('users').where({ id: storedToken.user_id }).first();
    if (!user) {
      return reply.status(401).send({
        code: 'UNAUTHORIZED',
        message: 'User not found',
        details: null,
        requestId: request.id,
      });
    }

    // Create new tokens with rotation tracking
    const tokens = await generateTokensWithRotation(user, storedToken.id);

    log.info({ action: 'refresh', userId: user.id }, 'Token refreshed');

    return reply.send({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    });
  });

  // -----------------------------------------------------------------------
  // POST /auth/logout
  // -----------------------------------------------------------------------
  app.post('/logout', { preHandler: [authenticate] }, async (request, reply) => {
    const { userId } = request.user;

    // Revoke all active refresh tokens for the user
    await db('refresh_tokens')
      .where({ user_id: userId })
      .whereNull('revoked_at')
      .update({ revoked_at: new Date() });

    log.info({ action: 'logout', userId }, 'User logged out — all refresh tokens revoked');

    return reply.status(200).send({ message: 'Logged out' });
  });

  // -----------------------------------------------------------------------
  // GET /auth/me
  // -----------------------------------------------------------------------
  app.get('/me', { preHandler: [authenticate] }, async (request, reply) => {
    const { userId } = request.user;

    const user = await db('users')
      .where({ id: userId })
      .select('id', 'username', 'status')
      .first();

    if (!user) {
      return reply.status(401).send({
        code: 'UNAUTHORIZED',
        message: 'User not found',
        details: null,
        requestId: request.id,
      });
    }

    const { roles, permissions } = await fetchUserRolesAndPermissions(userId);

    return reply.send({
      id: user.id,
      username: user.username,
      status: user.status,
      roles,
      permissions,
    });
  });
}

export default async function authPlugin(app, opts) {
  app.register(authRoutes, { prefix: '/auth' });
}

export { authRoutes };
