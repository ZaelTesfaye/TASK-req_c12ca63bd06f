/**
 * Authorization & Budget Gate Integration Tests
 *
 * Covers the new enforcement rules:
 *   - non-creator / non-elevated user cannot submit another user's draft
 *   - cross-user / cross-event attachment access returns 403
 *   - deleting a material / service window via a wrong event_id returns 404
 *   - PATCH budget_cap above the system cap without an approved override -> 422
 *   - budget_amount is NOT mutated while a budget-change approval is pending
 *   - /admin/cache/* endpoints are registered (reachable at transport layer)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import FormData from 'form-data';
import { setupTestDb, teardownTestDb, getApp, loginAs, db } from './setup.js';

let app;
let adminToken, plannerToken, chefToken, approverToken, managerToken;
let plannerEventId;
let otherEventId;
let materialId, otherMaterialId;
let windowId, otherWindowId;

beforeAll(async () => {
  await setupTestDb();
  app = await getApp();
  adminToken = await loginAs(app, 'admin', 'admin123!');
  plannerToken = await loginAs(app, 'planner', 'planner123!');
  chefToken = await loginAs(app, 'chef', 'chef123!');
  approverToken = await loginAs(app, 'approver', 'approver123!');
  managerToken = await loginAs(app, 'manager', 'manager123!');

  // planner creates an event
  const e1 = await app.inject({
    method: 'POST',
    url: '/events',
    headers: { Authorization: `Bearer ${plannerToken}` },
    payload: {
      title: 'Planner Gate Event',
      event_date: '2026-04-10',
      headcount: 30,
      budget_amount: 10000,
    },
  });
  plannerEventId = JSON.parse(e1.payload).data.id;

  // admin creates a second, unrelated event (used for cross-event tests)
  const e2 = await app.inject({
    method: 'POST',
    url: '/events',
    headers: { Authorization: `Bearer ${adminToken}` },
    payload: {
      title: 'Admin Other Event',
      event_date: '2026-05-10',
      headcount: 20,
      budget_amount: 2000,
    },
  });
  otherEventId = JSON.parse(e2.payload).data.id;

  // planner adds material + service window to their event
  const mat = await app.inject({
    method: 'POST',
    url: `/events/${plannerEventId}/materials`,
    headers: { Authorization: `Bearer ${plannerToken}` },
    payload: { material_type: 'rental', display_quantity: 5, unit: 'units' },
  });
  materialId = JSON.parse(mat.payload).data.id;

  const win = await app.inject({
    method: 'POST',
    url: `/events/${plannerEventId}/service-windows`,
    headers: { Authorization: `Bearer ${plannerToken}` },
    payload: {
      label: 'Main Service',
      start_at: '2026-04-10T10:00:00+00:00',
      end_at: '2026-04-10T14:00:00+00:00',
    },
  });
  windowId = JSON.parse(win.payload).data.id;

  // admin adds a material + window to the OTHER event so cross-event IDs exist
  const otherMat = await db('event_materials')
    .insert({
      event_id: otherEventId,
      material_type: 'rental',
      display_quantity: 2,
      unit: 'units',
    })
    .returning('*');
  otherMaterialId = otherMat[0].id;

  const otherWin = await db('event_service_windows')
    .insert({
      event_id: otherEventId,
      label: 'Other Main',
      start_at: '2026-05-10T10:00:00+00:00',
      end_at: '2026-05-10T14:00:00+00:00',
    })
    .returning('*');
  otherWindowId = otherWin[0].id;
}, 30000);

afterAll(async () => {
  if (app) await app.close();
  await teardownTestDb();
  await db.destroy();
}, 30000);

// ---------------------------------------------------------------------------
// 1. Submit-transition creator check
// ---------------------------------------------------------------------------
describe('PATCH /events/:id/state — submit requires creator or elevated perm', () => {
  it('returns 403 when a non-creator (manager) tries to submit another user\'s draft', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/events/${plannerEventId}/state`,
      headers: { Authorization: `Bearer ${managerToken}` },
      payload: { state: 'submitted' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('allows the creator (planner) to submit their own draft', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/events/${plannerEventId}/state`,
      headers: { Authorization: `Bearer ${plannerToken}` },
      payload: { state: 'submitted' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data.state).toBe('submitted');
  });
});

// ---------------------------------------------------------------------------
// 2. Cross-user / cross-event attachment access
// ---------------------------------------------------------------------------
describe('Attachments — parent-event access gate', () => {
  let uploadedId;
  const pngBytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00,
  ]);

  beforeAll(async () => {
    const form = new FormData();
    form.append('file', pngBytes, { filename: 'cross.png', contentType: 'image/png' });
    const res = await app.inject({
      method: 'POST',
      url: `/attachments?event_id=${plannerEventId}`,
      headers: {
        Authorization: `Bearer ${plannerToken}`,
        ...form.getHeaders(),
      },
      payload: form.getBuffer(),
    });
    uploadedId = JSON.parse(res.payload).data[0].attachment.id;
  });

  it('403 on GET /attachments?event_id=<other>\'s event for non-creator chef', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/attachments?event_id=${plannerEventId}`,
      headers: { Authorization: `Bearer ${chefToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('403 on GET /attachments/:id for a non-creator without scope', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/attachments/${uploadedId}`,
      headers: { Authorization: `Bearer ${chefToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('403 on GET /attachments/:id/download for a non-creator without scope', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/attachments/${uploadedId}/download`,
      headers: { Authorization: `Bearer ${chefToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('creator (planner) can still read their own attachment', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/attachments/${uploadedId}`,
      headers: { Authorization: `Bearer ${plannerToken}` },
    });
    expect(res.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 3. Child-delete cross-event mismatch
// ---------------------------------------------------------------------------
describe('DELETE event children — must be scoped by parent event_id', () => {
  it('returns 404 when deleting a material via the wrong event_id', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/events/${plannerEventId}/materials/${otherMaterialId}`,
      headers: { Authorization: `Bearer ${plannerToken}` },
    });
    expect(res.statusCode).toBe(404);

    // Other-event material must still exist
    const still = await db('event_materials').where({ id: otherMaterialId }).first();
    expect(still).toBeDefined();
  });

  it('returns 404 when deleting a service window via the wrong event_id', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/events/${plannerEventId}/service-windows/${otherWindowId}`,
      headers: { Authorization: `Bearer ${plannerToken}` },
    });
    expect(res.statusCode).toBe(404);

    const still = await db('event_service_windows').where({ id: otherWindowId }).first();
    expect(still).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 4 + 5. Budget gates
// ---------------------------------------------------------------------------
describe('Budget gates on PATCH /events/:id', () => {
  let budgetEventId;
  let baseBudget;

  beforeAll(async () => {
    // Fresh event in submitted state for the "pending approval" test
    const create = await app.inject({
      method: 'POST',
      url: '/events',
      headers: { Authorization: `Bearer ${plannerToken}` },
      payload: {
        title: 'Budget Gate Event',
        event_date: '2026-07-10',
        headcount: 40,
        budget_amount: 10000,
      },
    });
    budgetEventId = JSON.parse(create.payload).data.id;
    baseBudget = 10000;

    await app.inject({
      method: 'POST',
      url: `/events/${budgetEventId}/service-windows`,
      headers: { Authorization: `Bearer ${plannerToken}` },
      payload: {
        label: 'Main',
        start_at: '2026-07-10T10:00:00+00:00',
        end_at: '2026-07-10T14:00:00+00:00',
      },
    });
    await db('event_materials').insert({
      event_id: budgetEventId,
      material_type: 'rental',
      display_quantity: 3,
      unit: 'units',
    });
    await app.inject({
      method: 'PATCH',
      url: `/events/${budgetEventId}/state`,
      headers: { Authorization: `Bearer ${plannerToken}` },
      payload: { state: 'submitted' },
    });
  });

  it('rejects PATCH budget_cap above the system cap without an approved override', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/events/${budgetEventId}`,
      headers: { Authorization: `Bearer ${plannerToken}` },
      payload: { budget_cap: 40000 },
    });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('keeps budget_amount unchanged while a budget-change approval is pending', async () => {
    // >10% bump on a submitted event — backend must stash the request as a
    // pending approval and NOT mutate the live budget_amount.
    const newBudget = baseBudget + 2000; // +20%, within system cap
    const res = await app.inject({
      method: 'PATCH',
      url: `/events/${budgetEventId}`,
      headers: { Authorization: `Bearer ${plannerToken}` },
      payload: { budget_amount: newBudget },
    });
    expect(res.statusCode).toBe(200);

    // Live row still carries the old amount
    const dbEvent = await db('events').where({ id: budgetEventId }).first();
    expect(Number(dbEvent.budget_amount)).toBe(baseBudget);

    // A pending budget_change approval was recorded
    const pending = await db('approvals')
      .where({ event_id: budgetEventId, approval_type: 'budget_change', status: 'pending' })
      .first();
    expect(pending).toBeDefined();

    // The revision row captured the requested (but not yet live) amount
    const revision = await db('event_budget_revisions')
      .where({ event_id: budgetEventId })
      .orderBy('revision_no', 'desc')
      .first();
    expect(Number(revision.new_budget_amount)).toBe(newBudget);
  });
});

// ---------------------------------------------------------------------------
// 6. Admin cache routes reachable
// ---------------------------------------------------------------------------
describe('/admin/cache/* is registered', () => {
  it('GET /admin/cache/stats — unauthenticated returns 401 (not 404)', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/cache/stats' });
    expect(res.statusCode).toBe(401);
    expect(res.statusCode).not.toBe(404);
  });

  it('POST /admin/cache/purge — unauthenticated returns 401 (not 404)', async () => {
    const res = await app.inject({ method: 'POST', url: '/admin/cache/purge', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('admin can GET /admin/cache/stats successfully', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/cache/stats',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('mode');
  });

  it('non-admin (chef) gets 403 on /admin/cache/stats (not 404)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/cache/stats',
      headers: { Authorization: `Bearer ${chefToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
