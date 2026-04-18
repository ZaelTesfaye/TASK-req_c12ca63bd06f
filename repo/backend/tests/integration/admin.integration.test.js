/**
 * Admin / Roles Integration Tests
 *
 * Covers /admin/users/:id/roles, /admin/users/:id/manager-scopes, and
 * /admin/audit-trail. Real Postgres, no mocks.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { setupTestDb, teardownTestDb, getApp, loginAs } from './setup.js';
import db from '../../src/db/connection.js';

let app;
let adminToken;
let plannerToken;
let chefToken;
let adminUserId;
let chefUserId;
let eventId;

beforeAll(async () => {
  await setupTestDb();
  app = await getApp();

  adminToken = await loginAs(app, 'admin', 'admin123!');
  plannerToken = await loginAs(app, 'planner', 'planner123!');
  chefToken = await loginAs(app, 'chef', 'chef123!');

  const adminUser = await db('users').where({ username: 'admin' }).first();
  adminUserId = adminUser.id;
  const chefUser = await db('users').where({ username: 'chef' }).first();
  chefUserId = chefUser.id;

  // Create an event to target for manager-scope operations
  const eventRes = await app.inject({
    method: 'POST',
    url: '/events',
    headers: { Authorization: `Bearer ${adminToken}` },
    payload: {
      title: 'Admin Scope Test Event',
      event_date: '2026-06-15',
      headcount: 20,
      budget_amount: 2000,
    },
  });
  eventId = JSON.parse(eventRes.payload).data.id;
}, 30000);

afterAll(async () => {
  if (app) await app.close();
  await teardownTestDb();
}, 30000);

describe('Admin roles + manager-scopes (real DB)', () => {
  // -------------------------------------------------------------------------
  // GET /admin/roles
  // -------------------------------------------------------------------------
  describe('GET /admin/roles', () => {
    it('returns the full roles list for admin (200)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/roles',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(Array.isArray(body.data)).toBe(true);
      const roleNames = body.data.map((r) => r.name);
      expect(roleNames).toContain('admin');
      expect(roleNames).toContain('event_planner');
    });

    it('returns 403 for a regular user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/roles',
        headers: { Authorization: `Bearer ${plannerToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // POST /admin/users/:id/roles
  // -------------------------------------------------------------------------
  describe('POST /admin/users/:id/roles', () => {
    it('assigns a new role to a user (201) and persists it', async () => {
      // Assign the 'approver' role to the chef user (chef starts with culinary_editor)
      const res = await app.inject({
        method: 'POST',
        url: `/admin/users/${chefUserId}/roles`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { roleName: 'approver' },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.data.roleName).toBe('approver');

      const role = await db('roles').where({ name: 'approver' }).first();
      const link = await db('user_roles')
        .where({ user_id: chefUserId, role_id: role.id })
        .first();
      expect(link).toBeDefined();
    });

    it('returns 409 when assigning the same role twice', async () => {
      // chef already has culinary_editor from seed
      const res = await app.inject({
        method: 'POST',
        url: `/admin/users/${chefUserId}/roles`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { roleName: 'culinary_editor' },
      });
      expect(res.statusCode).toBe(409);
    });

    it('returns 403 when a non-admin tries to assign a role', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/admin/users/${chefUserId}/roles`,
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: { roleName: 'inventory_analyst' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /admin/users/:id/roles/:roleId
  // -------------------------------------------------------------------------
  describe('DELETE /admin/users/:id/roles/:roleId', () => {
    it('removes an existing role (200)', async () => {
      // Ensure we have a role to remove: assign 'inventory_analyst' first
      const role = await db('roles').where({ name: 'inventory_analyst' }).first();
      await db('user_roles')
        .insert({ user_id: chefUserId, role_id: role.id })
        .onConflict(['user_id', 'role_id']).ignore();

      const res = await app.inject({
        method: 'DELETE',
        url: `/admin/users/${chefUserId}/roles/${role.id}`,
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);

      const still = await db('user_roles')
        .where({ user_id: chefUserId, role_id: role.id })
        .first();
      expect(still).toBeUndefined();
    });

    it('returns 404 when the pairing does not exist', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/admin/users/${chefUserId}/roles/${randomUUID()}`,
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 403 for non-admin caller', async () => {
      const someRole = await db('roles').where({ name: 'event_planner' }).first();
      const res = await app.inject({
        method: 'DELETE',
        url: `/admin/users/${chefUserId}/roles/${someRole.id}`,
        headers: { Authorization: `Bearer ${plannerToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // POST /admin/users/:id/manager-scopes
  // -------------------------------------------------------------------------
  describe('POST /admin/users/:id/manager-scopes', () => {
    it('creates a manager scope (201)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/admin/users/${chefUserId}/manager-scopes`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { eventId },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.data.event_id).toBe(eventId);
      expect(body.data.user_id).toBe(chefUserId);
    });

    it('returns 422 when eventId is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/admin/users/${chefUserId}/manager-scopes`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(422);
    });
  });

  // -------------------------------------------------------------------------
  // GET /admin/users/:id/manager-scopes
  // -------------------------------------------------------------------------
  describe('GET /admin/users/:id/manager-scopes', () => {
    it('returns the list of scopes for a user (200)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/admin/users/${chefUserId}/manager-scopes`,
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
    });

    it('returns 404 for an unknown user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/admin/users/${randomUUID()}/manager-scopes`,
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /admin/users/:id/manager-scopes/:eventId
  // -------------------------------------------------------------------------
  describe('DELETE /admin/users/:id/manager-scopes/:eventId', () => {
    it('removes an existing manager scope (200)', async () => {
      // Ensure scope exists (may have been created above)
      await db('manager_event_scopes')
        .insert({ user_id: chefUserId, event_id: eventId, assigned_by: adminUserId })
        .onConflict(['user_id', 'event_id']).ignore();

      const res = await app.inject({
        method: 'DELETE',
        url: `/admin/users/${chefUserId}/manager-scopes/${eventId}`,
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);

      const still = await db('manager_event_scopes')
        .where({ user_id: chefUserId, event_id: eventId })
        .first();
      expect(still).toBeUndefined();
    });

    it('returns 404 when the scope does not exist', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/admin/users/${chefUserId}/manager-scopes/${randomUUID()}`,
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 403 for non-admin caller', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/admin/users/${chefUserId}/manager-scopes/${eventId}`,
        headers: { Authorization: `Bearer ${plannerToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // GET /admin/audit-trail
  // -------------------------------------------------------------------------
  describe('GET /admin/audit-trail', () => {
    it('returns paginated audit entries for admins (200)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/audit-trail?page=1&pageSize=10',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.pagination).toBeDefined();
    });

    it('filters by action when a valid query is supplied', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/audit-trail?action=create',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.every((e) => e.action === 'create')).toBe(true);
    });

    it('returns 403 for non-admin callers', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/audit-trail',
        headers: { Authorization: `Bearer ${plannerToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
