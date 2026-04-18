/**
 * Users Routes Integration Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, getApp, loginAs, db } from './setup.js';

let app;
let adminToken, plannerToken;
let plannerUserId, adminUserId;

beforeAll(async () => {
  await setupTestDb();
  app = await getApp();
  adminToken = await loginAs(app, 'admin', 'admin123!');
  plannerToken = await loginAs(app, 'planner', 'planner123!');
  plannerUserId = (await db('users').where({ username: 'planner' }).first()).id;
  adminUserId = (await db('users').where({ username: 'admin' }).first()).id;
}, 30000);

afterAll(async () => {
  if (app) await app.close();
  await teardownTestDb();
  await db.destroy();
}, 30000);

describe('GET /users (real DB)', () => {
  it('returns a paginated user list for admin role', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/users',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination).toBeDefined();
    expect(body.data.some((u) => u.id === adminUserId)).toBe(true);
  });

  it('returns 403 for non-admin caller', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/users',
      headers: { Authorization: `Bearer ${plannerToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('honors pagination query params (?page=1&pageSize=10)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/users?page=1&pageSize=10',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.pageSize).toBe(10);
    expect(body.data.length).toBeLessThanOrEqual(10);
  });
});

describe('GET /users/:id (real DB)', () => {
  it('returns the caller\'s own profile', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/users/${plannerUserId}`,
      headers: { Authorization: `Bearer ${plannerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.id).toBe(plannerUserId);
  });

  it('admin can fetch any user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/users/${plannerUserId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 403 when a non-admin fetches another user\'s profile', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/users/${adminUserId}`,
      headers: { Authorization: `Bearer ${plannerToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 for an unknown user id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/users/00000000-0000-0000-0000-000000000000',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH /users/:id/status (real DB)', () => {
  it('admin flips a user status from active to suspended and back', async () => {
    const suspend = await app.inject({
      method: 'PATCH',
      url: `/users/${plannerUserId}/status`,
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: { status: 'suspended' },
    });
    expect(suspend.statusCode).toBe(200);
    expect(JSON.parse(suspend.payload).data.status).toBe('suspended');

    const restore = await app.inject({
      method: 'PATCH',
      url: `/users/${plannerUserId}/status`,
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: { status: 'active' },
    });
    expect(restore.statusCode).toBe(200);
    expect(JSON.parse(restore.payload).data.status).toBe('active');
  });

  it('returns 403 for a non-admin caller', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${plannerUserId}/status`,
      headers: { Authorization: `Bearer ${plannerToken}` },
      payload: { status: 'suspended' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 422 for an invalid status value', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${plannerUserId}/status`,
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: { status: 'not-a-status' },
    });
    expect(res.statusCode).toBe(422);
  });
});
