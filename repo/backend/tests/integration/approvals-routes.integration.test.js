/**
 * Approvals Routes Integration Tests
 *
 * Covers POST /approvals/:id/approve and POST /approvals/:id/reject against
 * the real DB. A budget_change approval is created by updating a submitted
 * event's budget by >10% (triggers auto-creation of a pending approval).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { setupTestDb, teardownTestDb, getApp, loginAs, db } from './setup.js';

let app;
let plannerToken, approverToken, chefToken;
let pendingApprovalId;

beforeAll(async () => {
  await setupTestDb();
  app = await getApp();

  plannerToken = await loginAs(app, 'planner', 'planner123!');
  approverToken = await loginAs(app, 'approver', 'approver123!');
  chefToken = await loginAs(app, 'chef', 'chef123!');

  // Create an event, submit it, then bump budget > 10% to auto-create an approval.
  const create = await app.inject({
    method: 'POST',
    url: '/events',
    headers: { Authorization: `Bearer ${plannerToken}` },
    payload: {
      title: 'Approvals Routes Event',
      event_date: '2026-04-01',
      headcount: 20,
      budget_amount: 8000,
    },
  });
  const eventId = JSON.parse(create.payload).data.id;

  await app.inject({
    method: 'POST',
    url: `/events/${eventId}/service-windows`,
    headers: { Authorization: `Bearer ${plannerToken}` },
    payload: {
      label: 'Main',
      start_at: '2026-04-01T10:00:00+00:00',
      end_at: '2026-04-01T14:00:00+00:00',
    },
  });
  await db('event_materials').insert({
    event_id: eventId,
    material_type: 'rental',
    display_quantity: 5,
    unit: 'units',
  });
  await app.inject({
    method: 'PATCH',
    url: `/events/${eventId}/state`,
    headers: { Authorization: `Bearer ${plannerToken}` },
    payload: { state: 'submitted' },
  });

  // Increase budget from 8000 -> 10000 (25%) -- triggers budget_change approval
  await app.inject({
    method: 'PATCH',
    url: `/events/${eventId}`,
    headers: { Authorization: `Bearer ${plannerToken}` },
    payload: { budget_amount: 10000 },
  });

  const pending = await db('approvals')
    .where({ event_id: eventId, approval_type: 'budget_change', status: 'pending' })
    .first();
  pendingApprovalId = pending.id;
}, 30000);

afterAll(async () => {
  if (app) await app.close();
  await teardownTestDb();
  await db.destroy();
}, 30000);

describe('GET /approvals/pending (real DB)', () => {
  it('returns a pending-approvals list for an approver role', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/approvals/pending?page=1&pageSize=20',
      headers: { Authorization: `Bearer ${approverToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.some((a) => a.id === pendingApprovalId)).toBe(true);
    expect(body.pagination).toBeDefined();
  });

  it('returns an empty list when filtering by a type with no pending items', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/approvals/pending?approval_type=overtime',
      headers: { Authorization: `Bearer ${approverToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(0);
  });

  it('non-approver role sees an empty actionable list (permission filter applied)', async () => {
    // The handler permission-filters results rather than returning 403,
    // so a chef sees an empty list — no budget_change approvals to act on.
    const res = await app.inject({
      method: 'GET',
      url: '/approvals/pending',
      headers: { Authorization: `Bearer ${chefToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.every((a) => a.approval_type !== 'budget_change')).toBe(true);
  });
});

describe('POST /approvals/:id/approve (real DB)', () => {
  it('returns 403 for a non-approver role', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/approvals/${pendingApprovalId}/approve`,
      headers: { Authorization: `Bearer ${chefToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 for unknown approval id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/approvals/${randomUUID()}/approve`,
      headers: { Authorization: `Bearer ${approverToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });

  it('approver successfully approves the budget_change approval', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/approvals/${pendingApprovalId}/approve`,
      headers: { Authorization: `Bearer ${approverToken}` },
      payload: { justification: 'Approved due to venue cost increase' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data.status).toBe('approved');
  });
});

describe('POST /approvals/:id/reject (real DB)', () => {
  let newApprovalId;

  beforeAll(async () => {
    // Create a second budget_change approval we can reject
    const create = await app.inject({
      method: 'POST',
      url: '/events',
      headers: { Authorization: `Bearer ${plannerToken}` },
      payload: {
        title: 'Second Approvals Event',
        event_date: '2026-04-15',
        headcount: 20,
        budget_amount: 5000,
      },
    });
    const eventId = JSON.parse(create.payload).data.id;

    await app.inject({
      method: 'POST',
      url: `/events/${eventId}/service-windows`,
      headers: { Authorization: `Bearer ${plannerToken}` },
      payload: {
        label: 'Main',
        start_at: '2026-04-15T10:00:00+00:00',
        end_at: '2026-04-15T14:00:00+00:00',
      },
    });
    await db('event_materials').insert({
      event_id: eventId,
      material_type: 'rental',
      display_quantity: 3,
      unit: 'units',
    });
    await app.inject({
      method: 'PATCH',
      url: `/events/${eventId}/state`,
      headers: { Authorization: `Bearer ${plannerToken}` },
      payload: { state: 'submitted' },
    });
    await app.inject({
      method: 'PATCH',
      url: `/events/${eventId}`,
      headers: { Authorization: `Bearer ${plannerToken}` },
      payload: { budget_amount: 7000 },
    });

    const pending = await db('approvals')
      .where({ event_id: eventId, approval_type: 'budget_change', status: 'pending' })
      .first();
    newApprovalId = pending.id;
  });

  it('approver rejects with a justification', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/approvals/${newApprovalId}/reject`,
      headers: { Authorization: `Bearer ${approverToken}` },
      payload: { justification: 'Insufficient business case' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data.status).toBe('rejected');
  });

  it('returns 403 for a non-approver role', async () => {
    // Re-fetch a still-pending approval or create another if needed. For
    // simplicity we use the already-rejected one and assert the 403 happens
    // at the permission gate before state checks.
    const res = await app.inject({
      method: 'POST',
      url: `/approvals/${newApprovalId}/reject`,
      headers: { Authorization: `Bearer ${chefToken}` },
      payload: { justification: 'no' },
    });
    expect(res.statusCode).toBe(403);
  });
});
