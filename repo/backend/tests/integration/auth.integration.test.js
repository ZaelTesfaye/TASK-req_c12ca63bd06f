/**
 * Auth Integration Tests
 *
 * Real end-to-end tests against a live PostgreSQL database.
 * NO mocking — every call hits real Fastify routes and a real DB.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, getApp, loginAs, loginFull, db } from './setup.js';

let app;

beforeAll(async () => {
  await setupTestDb();
  app = await getApp();
}, 30000);

afterAll(async () => {
  if (app) await app.close();
  await teardownTestDb();
  await db.destroy();
}, 30000);

describe('Auth integration (real DB)', () => {
  // -------------------------------------------------------------------------
  // POST /auth/register
  // -------------------------------------------------------------------------
  describe('POST /auth/register', () => {
    it('registers a new user and the user appears in the users table', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          username: 'integration_user_1',
          password: 'Str0ngP@ssw0rd!',
        },
      });

      expect(res.statusCode).toBe(201);

      const body = JSON.parse(res.payload);
      expect(body.user).toBeDefined();
      expect(body.user.username).toBe('integration_user_1');
      expect(body.user.status).toBe('active');

      // Verify the user actually exists in the database
      const dbUser = await db('users')
        .where({ username: 'integration_user_1' })
        .first();
      expect(dbUser).toBeDefined();
      expect(dbUser.username).toBe('integration_user_1');
      expect(dbUser.status).toBe('active');
      // Password should be hashed, not plaintext
      expect(dbUser.password_hash).toBeDefined();
      expect(dbUser.password_hash).not.toBe('Str0ngP@ssw0rd!');
    });

    it('returns 409 when registering a duplicate username', async () => {
      // First registration should succeed (or already exist from previous test)
      const first = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          username: 'duplicate_user',
          password: 'Str0ngP@ssw0rd!',
        },
      });
      expect(first.statusCode).toBe(201);

      // Second registration with the same username should fail
      const second = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          username: 'duplicate_user',
          password: 'An0therP@ssw0rd!',
        },
      });

      expect(second.statusCode).toBe(409);
      const body = JSON.parse(second.payload);
      expect(body.code).toBe('CONFLICT');
    });

    it('assigns the default event_planner role to newly registered users', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          username: 'role_check_user',
          password: 'Str0ngP@ssw0rd!',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.user.roles).toContain('event_planner');

      // Verify in the DB via user_roles join
      const userRoles = await db('user_roles')
        .join('roles', 'user_roles.role_id', 'roles.id')
        .where('user_roles.user_id', body.user.id)
        .select('roles.name');
      expect(userRoles.map((r) => r.name)).toContain('event_planner');
    });
  });

  // -------------------------------------------------------------------------
  // POST /auth/login
  // -------------------------------------------------------------------------
  describe('POST /auth/login', () => {
    it('logs in with valid credentials and returns JWT tokens', async () => {
      // Use seeded admin user
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { username: 'admin', password: 'admin123!' },
      });

      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.payload);
      expect(body.accessToken).toBeDefined();
      expect(typeof body.accessToken).toBe('string');
      expect(body.refreshToken).toBeDefined();
      expect(typeof body.refreshToken).toBe('string');
      expect(body.expiresIn).toBeGreaterThan(0);
      expect(body.user.username).toBe('admin');
      expect(body.user.roles).toContain('admin');
    });

    it('returns 401 with wrong password', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { username: 'admin', password: 'wrong_password' },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 for a non-existent user', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { username: 'no_such_user_xyz', password: 'irrelevant' },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('stores a refresh token hash in the database on successful login', async () => {
      const loginBody = await loginFull(app, 'planner', 'planner123!');
      expect(loginBody.refreshToken).toBeDefined();

      // Verify a refresh_tokens row was created for this user
      const dbUser = await db('users').where({ username: 'planner' }).first();
      const tokens = await db('refresh_tokens')
        .where({ user_id: dbUser.id })
        .whereNull('revoked_at');
      expect(tokens.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // POST /auth/refresh
  // -------------------------------------------------------------------------
  describe('POST /auth/refresh', () => {
    it('rotates a refresh token and returns a new access token', async () => {
      const loginBody = await loginFull(app, 'admin', 'admin123!');
      const oldRefreshToken = loginBody.refreshToken;

      const res = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken: oldRefreshToken },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).toBeDefined();
      // The new refresh token should differ from the old one
      expect(body.refreshToken).not.toBe(oldRefreshToken);
    });

    it('rejects a previously used refresh token after rotation', async () => {
      const loginBody = await loginFull(app, 'planner', 'planner123!');
      const oldRefreshToken = loginBody.refreshToken;

      // Use the token once to rotate
      const rotateRes = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken: oldRefreshToken },
      });
      expect(rotateRes.statusCode).toBe(200);

      // Try to use the old token again — should be revoked
      const replayRes = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken: oldRefreshToken },
      });
      expect(replayRes.statusCode).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /auth/logout
  // -------------------------------------------------------------------------
  describe('POST /auth/logout', () => {
    it('revokes all refresh tokens for the user in the DB', async () => {
      const loginBody = await loginFull(app, 'approver', 'approver123!');
      const token = loginBody.accessToken;

      // Logout
      const res = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);

      // Verify all refresh tokens for this user are revoked
      const dbUser = await db('users').where({ username: 'approver' }).first();
      const activeTokens = await db('refresh_tokens')
        .where({ user_id: dbUser.id })
        .whereNull('revoked_at');
      expect(activeTokens.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // GET /auth/me
  // -------------------------------------------------------------------------
  describe('GET /auth/me', () => {
    it('returns the authenticated user profile with correct roles', async () => {
      const token = await loginAs(app, 'admin', 'admin123!');

      const res = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.username).toBe('admin');
      expect(body.roles).toContain('admin');
      expect(body.permissions).toBeDefined();
      expect(Array.isArray(body.permissions)).toBe(true);
      // Admin should have many permissions
      expect(body.permissions.length).toBeGreaterThan(5);
    });

    it('returns 401 without a valid token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { Authorization: 'Bearer invalid.token.here' },
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
