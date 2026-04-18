/**
 * Backup Route Integration Tests
 *
 * Covers /admin/backups/runs, /admin/backups/restore-test, and
 * /admin/backups/drills against the real DB.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, getApp, loginAs, db } from './setup.js';

let app;
let adminToken, plannerToken;
let backupRunId;

beforeAll(async () => {
  await setupTestDb();
  app = await getApp();
  adminToken = await loginAs(app, 'admin', 'admin123!');
  plannerToken = await loginAs(app, 'planner', 'planner123!');

  const [run] = await db('backup_runs')
    .insert({
      started_at: new Date('2025-06-01T00:00:00Z'),
      ended_at: new Date('2025-06-01T00:10:00Z'),
      status: 'completed',
      artifact_path: '/var/backups/run-1.dump',
    })
    .returning('*');
  backupRunId = run.id;
}, 30000);

afterAll(async () => {
  if (app) await app.close();
  await teardownTestDb();
  await db.destroy();
}, 30000);

describe('GET /admin/backups/runs (real DB)', () => {
  it('returns backup run history for admin (200)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/backups/runs',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.some((r) => r.id === backupRunId)).toBe(true);
  });

  it('returns 403 for non-admin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/backups/runs',
      headers: { Authorization: `Bearer ${plannerToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /admin/backups/restore-test (real DB)', () => {
  it('records a restore-test drill (201) for admin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/backups/restore-test',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        backup_run_id: backupRunId,
        drill_quarter: '2025-Q2',
        status: 'completed',
        notes: 'Quarterly drill — green',
      },
    });
    expect([200, 201]).toContain(res.statusCode);
    const body = JSON.parse(res.payload);
    expect(body.data).toBeDefined();
    expect(body.data.backup_run_id).toBe(backupRunId);
    expect(body.data.drill_quarter).toBe('2025-Q2');
  });

  it('returns 403 for non-admin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/backups/restore-test',
      headers: { Authorization: `Bearer ${plannerToken}` },
      payload: {
        backup_run_id: backupRunId,
        drill_quarter: '2025-Q2',
      },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /admin/backups/drills (real DB)', () => {
  it('returns the drill list for admin (200)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/backups/drills',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('returns 403 for non-admin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/backups/drills',
      headers: { Authorization: `Bearer ${plannerToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
