/**
 * Entitlements Route Integration Tests
 *
 * Covers GET /entitlements, GET /entitlements/:id/redemptions, and the
 * bulk-import/confirm error path. Full redeem happy-path + expiry/quantity
 * failure cases live in `entitlements.integration.test.js`.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import FormData from 'form-data';
import { setupTestDb, teardownTestDb, getApp, loginAs } from './setup.js';
import db from '../../src/db/connection.js';

let app;
let adminToken, plannerToken, chefToken;
let plannerUserId, chefUserId;
let entitlementTypeId;
let plannerEntitlementId;

beforeAll(async () => {
  await setupTestDb();
  app = await getApp();
  adminToken = await loginAs(app, 'admin', 'admin123!');
  plannerToken = await loginAs(app, 'planner', 'planner123!');
  chefToken = await loginAs(app, 'chef', 'chef123!');

  plannerUserId = (await db('users').where({ username: 'planner' }).first()).id;
  chefUserId = (await db('users').where({ username: 'chef' }).first()).id;
  const type = await db('entitlement_types').where({ code: 'staff_meal' }).first();
  entitlementTypeId = type.id;

  const evt = await app.inject({
    method: 'POST',
    url: '/events',
    headers: { Authorization: `Bearer ${adminToken}` },
    payload: {
      title: 'Entitlement Route Event',
      event_date: '2026-03-20',
      headcount: 10,
      budget_amount: 1000,
    },
  });
  const eventId = JSON.parse(evt.payload).data.id;

  const issued = await app.inject({
    method: 'POST',
    url: '/entitlements/issue-manual',
    headers: { Authorization: `Bearer ${adminToken}` },
    payload: {
      event_id: eventId,
      user_id: plannerUserId,
      entitlement_type_id: entitlementTypeId,
      quantity_total: 5,
    },
  });
  plannerEntitlementId = JSON.parse(issued.payload).data.id;
}, 30000);

afterAll(async () => {
  if (app) await app.close();
  await teardownTestDb();
}, 30000);

describe('GET /entitlements (real DB)', () => {
  it('returns paginated list of the caller\'s own entitlements', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/entitlements?page=1&pageSize=10',
      headers: { Authorization: `Bearer ${plannerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.some((e) => e.id === plannerEntitlementId)).toBe(true);
  });

  it('privileged (admin) caller can query by user_id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/entitlements?user_id=${plannerUserId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.some((e) => e.user_id === plannerUserId)).toBe(true);
  });

  it('non-privileged caller requesting another user\'s entitlements gets 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/entitlements?user_id=${plannerUserId}`,
      headers: { Authorization: `Bearer ${chefToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /entitlements/:id/redemptions (real DB)', () => {
  it('owner can list their entitlement redemptions', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/entitlements/${plannerEntitlementId}/redemptions`,
      headers: { Authorization: `Bearer ${plannerToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(res.payload).data)).toBe(true);
  });

  it('returns 404 for an unknown entitlement', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/entitlements/${randomUUID()}/redemptions`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /entitlements/:id (real DB)', () => {
  it('owner can fetch their own entitlement (200)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/entitlements/${plannerEntitlementId}`,
      headers: { Authorization: `Bearer ${plannerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.id).toBe(plannerEntitlementId);
    expect(body.data.user_id).toBe(plannerUserId);
  });

  it('privileged (admin) caller can fetch any entitlement', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/entitlements/${plannerEntitlementId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 for a nonexistent entitlement id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/entitlements/${randomUUID()}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 for a non-owner, non-privileged caller', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/entitlements/${plannerEntitlementId}`,
      headers: { Authorization: `Bearer ${chefToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /entitlements/bulk-import/validate (real DB)', () => {
  it('returns 200 with validation results for a valid CSV', async () => {
    const evt = await app.inject({
      method: 'POST',
      url: '/events',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        title: 'Bulk Import Validate Event',
        event_date: '2026-05-01',
        headcount: 10,
        budget_amount: 500,
      },
    });
    const eventId = JSON.parse(evt.payload).data.id;

    const csvContent = [
      'event_id,user_id,entitlement_type_code,quantity_total',
      `${eventId},${plannerUserId},staff_meal,3`,
    ].join('\n');

    const form = new FormData();
    form.append('file', Buffer.from(csvContent), {
      filename: 'bulk.csv',
      contentType: 'text/csv',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/entitlements/bulk-import/validate',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        ...form.getHeaders(),
      },
      payload: form.getBuffer(),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data).toBeDefined();
    expect(body.data.summary).toBeDefined();
    expect(Array.isArray(body.data.valid)).toBe(true);
    expect(Array.isArray(body.data.errors)).toBe(true);
  });

  it('returns 422 when the multipart body is missing a file', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/entitlements/bulk-import/validate',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'multipart/form-data; boundary=----empty',
      },
      payload: '------empty--\r\n',
    });
    expect(res.statusCode).toBe(422);
  });
});

describe('POST /entitlements/:id/redeem idempotency (real DB)', () => {
  it('second redeem with same idempotency_key returns the same redemption_id', async () => {
    const key = randomUUID();
    const first = await app.inject({
      method: 'POST',
      url: `/entitlements/${plannerEntitlementId}/redeem`,
      headers: { Authorization: `Bearer ${plannerToken}` },
      payload: { quantity: 1, idempotency_key: key },
    });
    expect(first.statusCode).toBe(200);
    const firstId = JSON.parse(first.payload).data.redemption_id;

    const second = await app.inject({
      method: 'POST',
      url: `/entitlements/${plannerEntitlementId}/redeem`,
      headers: { Authorization: `Bearer ${plannerToken}` },
      payload: { quantity: 1, idempotency_key: key },
    });
    expect(second.statusCode).toBe(200);
    expect(JSON.parse(second.payload).data.redemption_id).toBe(firstId);
  });
});

describe('POST /entitlements/bulk-import/confirm (real DB)', () => {
  it('returns 404 for an unknown batch_id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/entitlements/bulk-import/confirm',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: { batch_id: randomUUID() },
    });
    expect(res.statusCode).toBe(404);
  });

  it('commits entitlements from a validated batch and reports them in the response', async () => {
    // End-to-end: validate -> confirm. The confirm step is the commit path;
    // it must actually create entitlement rows from the staged batch payload.
    const evt = await app.inject({
      method: 'POST',
      url: '/events',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        title: 'Bulk Import Confirm Event',
        event_date: '2026-07-10',
        headcount: 5,
        budget_amount: 200,
      },
    });
    const eventId = JSON.parse(evt.payload).data.id;

    const csv = [
      'event_id,user_id,entitlement_type_code,quantity_total',
      `${eventId},${chefUserId},staff_meal,2`,
    ].join('\n');

    const form = new FormData();
    form.append('file', Buffer.from(csv), {
      filename: 'confirm.csv',
      contentType: 'text/csv',
    });

    const validateRes = await app.inject({
      method: 'POST',
      url: '/entitlements/bulk-import/validate',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        ...form.getHeaders(),
      },
      payload: form.getBuffer(),
    });
    expect(validateRes.statusCode).toBe(200);
    const batchId = JSON.parse(validateRes.payload).data.batch_id;
    expect(batchId).toBeTruthy();

    const confirmRes = await app.inject({
      method: 'POST',
      url: '/entitlements/bulk-import/confirm',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: { batch_id: batchId },
    });
    expect(confirmRes.statusCode).toBe(201);

    const body = JSON.parse(confirmRes.payload);
    expect(body.data.batch).toBeDefined();
    expect(body.data.entitlement_count).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(body.data.entitlements)).toBe(true);

    // The newly-created entitlement must actually exist in the DB for
    // the target user and event.
    const chefEntitlements = await db('entitlements')
      .where({ user_id: chefUserId, event_id: eventId });
    expect(chefEntitlements.length).toBeGreaterThanOrEqual(1);
  });
});
