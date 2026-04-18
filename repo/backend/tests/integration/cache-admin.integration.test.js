/**
 * Admin Cache Route Integration Tests
 *
 * Covers POST /admin/cache/purge and GET /admin/cache/stats against the
 * real DB and the registered cache plugin.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, getApp, loginAs } from './setup.js';
import db from '../../src/db/connection.js';

let app;
let adminToken, plannerToken;

beforeAll(async () => {
  await setupTestDb();
  app = await getApp();
  adminToken = await loginAs(app, 'admin', 'admin123!');
  plannerToken = await loginAs(app, 'planner', 'planner123!');
}, 30000);

afterAll(async () => {
  if (app) await app.close();
  await teardownTestDb();
}, 30000);

describe('POST /admin/cache/purge (real DB)', () => {
  it('purges the cache for admin (200)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/cache/purge',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.purged).toBe(true);
  });

  it('purges a specific key for admin (200)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/cache/purge',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: { key: 'some:cache:key' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.purged).toBe(true);
  });

  it('returns 403 for a non-admin caller', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/cache/purge',
      headers: { Authorization: `Bearer ${plannerToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /admin/cache/stats (real DB)', () => {
  it('returns a stats payload for admin (200)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/cache/stats',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toBeDefined();
    expect(typeof body).toBe('object');
    // The plugin exposes at least these keys in its stats shape
    expect(body).toHaveProperty('hits');
    expect(body).toHaveProperty('misses');
  });

  it('returns 403 for a non-admin caller', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/cache/stats',
      headers: { Authorization: `Bearer ${plannerToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
