/**
 * Data Collection Routes Integration Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { setupTestDb, teardownTestDb, getApp, loginAs, db } from './setup.js';

let app;
let adminToken, plannerToken;
let pendingJobId, failedJobId;

beforeAll(async () => {
  await setupTestDb();
  app = await getApp();
  adminToken = await loginAs(app, 'admin', 'admin123!');
  plannerToken = await loginAs(app, 'planner', 'planner123!');

  const [pending] = await db('data_collection_jobs')
    .insert({ source_name: 'source-pending', status: 'pending' })
    .returning('*');
  pendingJobId = pending.id;

  const [failed] = await db('data_collection_jobs')
    .insert({ source_name: 'source-failed', status: 'failed' })
    .returning('*');
  failedJobId = failed.id;

  // Ensure admin role has ops:data_collection_admin permission (admin gets ALL
  // permissions via the seed; nothing to do).
}, 30000);

afterAll(async () => {
  if (app) await app.close();
  await teardownTestDb();
  await db.destroy();
}, 30000);

describe('GET /data-collection/health (real DB)', () => {
  it('returns 200 with a health status payload for admin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/data-collection/health',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data).toBeDefined();
    expect(typeof body.data).toBe('object');
  });

  it('returns 403 for a non-admin caller', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/data-collection/health',
      headers: { Authorization: `Bearer ${plannerToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /admin/data-collection/jobs (real DB)', () => {
  it('returns a paginated job list for admin (200)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/data-collection/jobs?page=1&pageSize=20',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination).toBeDefined();
    expect(body.data.some((j) => j.id === pendingJobId)).toBe(true);
  });

  it('returns 403 for non-admin caller', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/data-collection/jobs',
      headers: { Authorization: `Bearer ${plannerToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /data-collection/jobs/:id/requeue (real DB)', () => {
  it('requeues a failed job', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/data-collection/jobs/${failedJobId}/requeue`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.status).toBe('pending');
  });

  it('returns 404 for unknown job id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/data-collection/jobs/${randomUUID()}/requeue`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 for non-admin caller', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/data-collection/jobs/${pendingJobId}/requeue`,
      headers: { Authorization: `Bearer ${plannerToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
