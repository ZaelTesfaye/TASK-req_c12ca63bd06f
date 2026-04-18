/**
 * Audit Trail Immutability Integration Tests
 *
 * Proves that the audit_trail table is immutable at the database level.
 * The PostgreSQL triggers (trg_audit_trail_no_update, trg_audit_trail_no_delete)
 * prevent any UPDATE or DELETE operations on audit_trail rows.
 *
 * This is the critical test that validates a real security property of the system,
 * replacing any trivial `expect(true).toBe(true)` placeholder.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, getApp, loginAs } from './setup.js';
import db from '../../src/db/connection.js';

let app;
let adminToken;

beforeAll(async () => {
  await setupTestDb();
  app = await getApp();
  adminToken = await loginAs(app, 'admin', 'admin123!');
}, 30000);

afterAll(async () => {
  if (app) await app.close();
  await teardownTestDb();
}, 30000);

describe('Audit trail immutability (real DB)', () => {
  it('creates audit_trail entries when an event is created', async () => {
    // Create something that writes an audit entry
    const res = await app.inject({
      method: 'POST',
      url: '/events',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        title: 'Immutability Test Event',
        event_date: '2025-12-01',
        headcount: 10,
        budget_amount: 1000,
      },
    });

    expect(res.statusCode).toBe(201);

    // Verify audit entries exist
    const entries = await db('audit_trail').select('id', 'action').limit(5);
    expect(entries.length).toBeGreaterThan(0);
  });

  it('prevents UPDATE on audit_trail via DB trigger', async () => {
    // Fetch an existing audit entry
    const entries = await db('audit_trail').select('id').limit(1);
    expect(entries.length).toBeGreaterThan(0);

    const entryId = entries[0].id;

    // Attempt to UPDATE — should fail because the trigger raises an exception
    await expect(
      db.raw(`UPDATE audit_trail SET action = 'tampered' WHERE id = '${entryId}'`),
    ).rejects.toThrow(/not allowed|audit_trail/i);
  });

  it('prevents DELETE from audit_trail via DB trigger', async () => {
    // Fetch an existing audit entry
    const entries = await db('audit_trail').select('id').limit(1);
    expect(entries.length).toBeGreaterThan(0);

    const entryId = entries[0].id;

    // Attempt to DELETE — should fail because the trigger raises an exception
    await expect(
      db.raw(`DELETE FROM audit_trail WHERE id = '${entryId}'`),
    ).rejects.toThrow(/not allowed|audit_trail/i);
  });

  it('still allows INSERT into audit_trail (append-only)', async () => {
    // Verify we can still write new entries via the normal code path
    const countBefore = await db('audit_trail').count('id as count').first();
    const before = Number(countBefore.count);

    // Create another event to trigger an audit write
    const res = await app.inject({
      method: 'POST',
      url: '/events',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        title: 'Append Only Verification',
        event_date: '2025-11-15',
        headcount: 5,
        budget_amount: 500,
      },
    });
    expect(res.statusCode).toBe(201);

    const countAfter = await db('audit_trail').count('id as count').first();
    const after = Number(countAfter.count);
    expect(after).toBeGreaterThan(before);
  });

  it('confirms the immutability triggers exist in the database', async () => {
    // Query pg_trigger to verify the protection triggers are installed
    const triggers = await db.raw(`
      SELECT tgname
      FROM pg_trigger
      WHERE tgrelid = 'audit_trail'::regclass
        AND tgname IN ('trg_audit_trail_no_update', 'trg_audit_trail_no_delete')
    `);

    const triggerNames = triggers.rows.map((r) => r.tgname);
    expect(triggerNames).toContain('trg_audit_trail_no_update');
    expect(triggerNames).toContain('trg_audit_trail_no_delete');
  });
});
