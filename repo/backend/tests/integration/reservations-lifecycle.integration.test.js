/**
 * Reservations Lifecycle Integration Tests
 *
 * Walks a reservation through the full state machine and asserts the
 * pass/fail behaviour of each transition route. Auth 403 gaps live in
 * `reservations-authorization.integration.test.js` and are not duplicated.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { setupTestDb, teardownTestDb, getApp, loginAs } from './setup.js';
import db from '../../src/db/connection.js';

let app;
let adminToken, managerToken, approverToken, plannerToken;
let eventId, resourceId;
let reservationId;

async function createReservation(startOffsetMinutes = 60, endOffsetMinutes = 120) {
  const start = new Date(Date.now() + startOffsetMinutes * 60000).toISOString();
  const end = new Date(Date.now() + endOffsetMinutes * 60000).toISOString();
  const res = await app.inject({
    method: 'POST',
    url: '/reservations',
    headers: { Authorization: `Bearer ${managerToken}` },
    payload: {
      event_id: eventId,
      resource_id: resourceId,
      scheduled_start_at: start,
      scheduled_end_at: end,
    },
  });
  return JSON.parse(res.payload).data.id;
}

async function approve(id) {
  await app.inject({
    method: 'POST',
    url: `/reservations/${id}/approve`,
    headers: { Authorization: `Bearer ${managerToken}` },
  });
}

async function release(id) {
  await app.inject({
    method: 'POST',
    url: `/reservations/${id}/release`,
    headers: { Authorization: `Bearer ${managerToken}` },
  });
}

async function occupy(id, occupancy = 5) {
  await app.inject({
    method: 'POST',
    url: `/reservations/${id}/occupy`,
    headers: { Authorization: `Bearer ${managerToken}` },
    payload: { occupancy_count: occupancy },
  });
}

beforeAll(async () => {
  await setupTestDb();
  app = await getApp();
  adminToken = await loginAs(app, 'admin', 'admin123!');
  managerToken = await loginAs(app, 'manager', 'manager123!');
  approverToken = await loginAs(app, 'approver', 'approver123!');
  plannerToken = await loginAs(app, 'planner', 'planner123!');

  const evt = await app.inject({
    method: 'POST',
    url: '/events',
    headers: { Authorization: `Bearer ${adminToken}` },
    payload: {
      title: 'Reservation Lifecycle Event',
      event_date: '2026-08-01',
      headcount: 30,
      budget_amount: 3000,
    },
  });
  eventId = JSON.parse(evt.payload).data.id;

  // Grant manager scope for this event. The approver needs a scope row
  // too — reservations/service.js::approveOvertime calls assertEventScope
  // before mutating state, so the approve-overtime route 403s even for
  // a caller that holds reservation:overtime_approve if they lack a
  // scope record for the target event.
  const adminUser = await db('users').where({ username: 'admin' }).first();
  const managerUser = await db('users').where({ username: 'manager' }).first();
  const approverUser = await db('users').where({ username: 'approver' }).first();
  await db('manager_event_scopes').insert([
    { user_id: managerUser.id, event_id: eventId, assigned_by: adminUser.id },
    { user_id: approverUser.id, event_id: eventId, assigned_by: adminUser.id },
  ]);

  const [resource] = await db('resources')
    .insert({
      name: 'Lifecycle Test Room',
      resource_type: 'room',
      status: 'published',
    })
    .returning('*');
  resourceId = resource.id;

  reservationId = await createReservation();
}, 30000);

afterAll(async () => {
  if (app) await app.close();
  await teardownTestDb();
}, 30000);

describe('Reservations lifecycle (real DB)', () => {
  it('GET /reservations returns paginated list with ?status filter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/reservations?page=1&pageSize=10&status=requested',
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination).toBeDefined();
    expect(body.data.every((r) => r.status === 'requested')).toBe(true);
  });

  it('GET /reservations/:id returns the reservation', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/reservations/${reservationId}`,
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data.id).toBe(reservationId);
  });

  it('GET /reservations/:id returns 404 for unknown id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/reservations/${randomUUID()}`,
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /reservations/:id/approve — manager approves their scoped reservation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/reservations/${reservationId}/approve`,
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data.status).toBe('approved');
  });

  it('POST /reservations/:id/approve — 403 for planner without reservation:approve', async () => {
    const id = await createReservation(180, 240);
    const res = await app.inject({
      method: 'POST',
      url: `/reservations/${id}/approve`,
      headers: { Authorization: `Bearer ${plannerToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /reservations/:id/release moves approved -> released', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/reservations/${reservationId}/release`,
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data.status).toBe('released');
  });

  it('POST /reservations/:id/release — 422 on invalid state (already released)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/reservations/${reservationId}/release`,
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    expect(res.statusCode).toBe(422);
  });

  it('POST /reservations/:id/occupy moves released -> occupied', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/reservations/${reservationId}/occupy`,
      headers: { Authorization: `Bearer ${managerToken}` },
      payload: { occupancy_count: 5 },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data.status).toBe('occupied');
  });

  it('POST /reservations/:id/occupy — 422 if not released', async () => {
    const id = await createReservation(300, 360);
    const res = await app.inject({
      method: 'POST',
      url: `/reservations/${id}/occupy`,
      headers: { Authorization: `Bearer ${managerToken}` },
      payload: { occupancy_count: 1 },
    });
    expect(res.statusCode).toBe(422);
  });

  it('POST /reservations/:id/return moves occupied -> returned (no overtime)', async () => {
    // Use scheduled_end_at close to now so no overtime
    const scheduledEnd = new Date(Date.now() + 90 * 60000).toISOString();
    const res = await app.inject({
      method: 'POST',
      url: `/reservations/${reservationId}/return`,
      headers: { Authorization: `Bearer ${managerToken}` },
      payload: { actual_end_at: scheduledEnd },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data.status).toBe('returned');
  });

  it('POST /reservations/:id/return — 422 on invalid state (already returned)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/reservations/${reservationId}/return`,
      headers: { Authorization: `Bearer ${managerToken}` },
      payload: { actual_end_at: new Date().toISOString() },
    });
    expect(res.statusCode).toBe(422);
  });

  it('POST /reservations/:id/cancel cancels a fresh reservation', async () => {
    const id = await createReservation(420, 480);
    const res = await app.inject({
      method: 'POST',
      url: `/reservations/${id}/cancel`,
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data.status).toBe('cancelled');
  });

  it('POST /reservations/:id/cancel — 422 if already cancelled', async () => {
    const id = await createReservation(540, 600);
    await app.inject({
      method: 'POST',
      url: `/reservations/${id}/cancel`,
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/reservations/${id}/cancel`,
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    expect(res.statusCode).toBe(422);
  });

  it('POST /reservations/:id/reschedule creates a replacement and marks old as rescheduled', async () => {
    const id = await createReservation(660, 720);
    const newStart = new Date(Date.now() + 780 * 60000).toISOString();
    const newEnd = new Date(Date.now() + 840 * 60000).toISOString();
    const res = await app.inject({
      method: 'POST',
      url: `/reservations/${id}/reschedule`,
      headers: { Authorization: `Bearer ${managerToken}` },
      payload: {
        scheduled_start_at: newStart,
        scheduled_end_at: newEnd,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.old_reservation.status).toBe('rescheduled');
    expect(body.data.new_reservation.id).not.toBe(id);
  });

  it('POST /reservations/:id/reschedule — 422 if reservation already cancelled', async () => {
    const id = await createReservation(900, 960);
    await app.inject({
      method: 'POST',
      url: `/reservations/${id}/cancel`,
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/reservations/${id}/reschedule`,
      headers: { Authorization: `Bearer ${managerToken}` },
      payload: {
        scheduled_start_at: new Date(Date.now() + 1000 * 60000).toISOString(),
        scheduled_end_at: new Date(Date.now() + 1060 * 60000).toISOString(),
      },
    });
    expect(res.statusCode).toBe(422);
  });

  it('POST /reservations/:id/renew extends an active reservation', async () => {
    const id = await createReservation(1100, 1160);
    const newEnd = new Date(Date.now() + 1220 * 60000).toISOString();
    const res = await app.inject({
      method: 'POST',
      url: `/reservations/${id}/renew`,
      headers: { Authorization: `Bearer ${managerToken}` },
      payload: { new_end_at: newEnd },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data.scheduled_end_at).toBeDefined();
  });

  it('POST /reservations/:id/renew — 422 if reservation cancelled', async () => {
    const id = await createReservation(1300, 1360);
    await app.inject({
      method: 'POST',
      url: `/reservations/${id}/cancel`,
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/reservations/${id}/renew`,
      headers: { Authorization: `Bearer ${managerToken}` },
      payload: { new_end_at: new Date(Date.now() + 1400 * 60000).toISOString() },
    });
    expect(res.statusCode).toBe(422);
  });

  it('POST /reservations/:id/approve-overtime approves pending overtime', async () => {
    // Build a reservation that will return with >30min overtime to create an
    // overtime approval record pending.
    const id = await createReservation(1500, 1520); // 20 min window
    await approve(id);
    await release(id);
    await occupy(id, 3);
    const actualEnd = new Date(Date.now() + 1580 * 60000).toISOString(); // 80 min past start, 60 past end

    const returnRes = await app.inject({
      method: 'POST',
      url: `/reservations/${id}/return`,
      headers: { Authorization: `Bearer ${managerToken}` },
      payload: {
        actual_end_at: actualEnd,
        overtime_justification: 'Guests overstayed',
      },
    });
    expect(returnRes.statusCode).toBe(200);

    const res = await app.inject({
      method: 'POST',
      url: `/reservations/${id}/approve-overtime`,
      headers: { Authorization: `Bearer ${approverToken}` },
      payload: { justification: 'Accepted' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    // Full response-shape validation: the updated reservation row must
    // surface the cleared overtime-pending flag and record the approver
    // on overtime_approved_by + overtime_approved_at.
    expect(body.data).toBeDefined();
    expect(body.data.id).toBe(id);
    expect(body.data.status).toBe('returned');
    expect(body.data.overtime_pending_approval).toBe(false);
    expect(body.data.overtime_approved_by).toBeTruthy();
    expect(body.data.overtime_approved_at).toBeTruthy();
    expect(Number(body.data.overtime_minutes)).toBeGreaterThan(30);

    // And the underlying approvals row should have been flipped to approved
    // and linked to the overtime approver — verified directly against the DB
    // so we catch silent side-effect regressions.
    const approverUser = await db('users').where({ username: 'approver' }).first();
    const approval = await db('approvals')
      .where({ event_id: eventId, approval_type: 'overtime', status: 'approved' })
      .orderBy('decided_at', 'desc')
      .first();
    expect(approval).toBeDefined();
    expect(approval.first_approver_id).toBe(approverUser.id);
    expect(approval.decided_at).toBeTruthy();
  });

  it('POST /reservations/:id/approve-overtime — 422 when no overtime pending', async () => {
    const id = await createReservation(1700, 1760);
    const res = await app.inject({
      method: 'POST',
      url: `/reservations/${id}/approve-overtime`,
      headers: { Authorization: `Bearer ${approverToken}` },
      payload: { justification: 'n/a' },
    });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('INVALID_STATE');
    expect(typeof body.message).toBe('string');
    expect(body.requestId).toBeDefined();
  });

  it('POST /reservations/:id/approve-overtime — 403 for a role without reservation:overtime_approve', async () => {
    // resource_manager has reservation:approve + reservation:operate but
    // explicitly NOT reservation:overtime_approve. The authorize() gate on
    // the route must deny before the service runs.
    const id = await createReservation(1900, 1960);
    const res = await app.inject({
      method: 'POST',
      url: `/reservations/${id}/approve-overtime`,
      headers: { Authorization: `Bearer ${managerToken}` },
      payload: { justification: 'not allowed' },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('FORBIDDEN');
    expect(Array.isArray(body.details.required)).toBe(true);
    expect(body.details.required).toContain('reservation:overtime_approve');
  });

  it('POST /reservations/:id/approve-overtime — 401 without a Bearer token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/reservations/${randomUUID()}/approve-overtime`,
      payload: { justification: 'unauth' },
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('POST /reservations/:id/approve-overtime — 422 on a missing justification (validation)', async () => {
    const id = await createReservation(2100, 2160);
    const res = await app.inject({
      method: 'POST',
      url: `/reservations/${id}/approve-overtime`,
      headers: { Authorization: `Bearer ${approverToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(body.details.errors)).toBe(true);
    expect(body.details.errors.some((e) => e.path === 'justification')).toBe(true);
  });
});
