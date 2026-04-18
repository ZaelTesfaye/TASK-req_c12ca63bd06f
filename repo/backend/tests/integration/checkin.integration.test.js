/**
 * Check-in Integration Tests
 *
 * Scenarios covered here:
 *   - POST /events/:id/check-in: happy 201, over-capacity 422 when no
 *     over_cap_reason, outside-window returns warning
 *   - GET /events/:id/check-in: scoped user 200, out-of-scope user 403
 *
 * Auth 403 paths (missing event:service etc.) are covered by
 * authorization-gaps.integration.test.js — NOT duplicated here.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, getApp, loginAs, db } from './setup.js';

let app;
let adminToken, managerToken, plannerToken, approverToken;
let eventId;
let adminUserId;
let managerUserId;
let plannerUserId;

beforeAll(async () => {
  await setupTestDb();
  app = await getApp();

  adminToken = await loginAs(app, 'admin', 'admin123!');
  managerToken = await loginAs(app, 'manager', 'manager123!');
  plannerToken = await loginAs(app, 'planner', 'planner123!');
  approverToken = await loginAs(app, 'approver', 'approver123!');

  adminUserId = (await db('users').where({ username: 'admin' }).first()).id;
  managerUserId = (await db('users').where({ username: 'manager' }).first()).id;
  plannerUserId = (await db('users').where({ username: 'planner' }).first()).id;

  // Admin creates an event with a very small headcount so we can hit capacity.
  const eventRes = await app.inject({
    method: 'POST',
    url: '/events',
    headers: { Authorization: `Bearer ${adminToken}` },
    payload: {
      title: 'CheckIn Lifecycle Event',
      event_date: '2026-02-01',
      headcount: 1,
      budget_amount: 500,
    },
  });
  eventId = JSON.parse(eventRes.payload).data.id;

  // Manager scope so the manager passes the object-level gate
  await db('manager_event_scopes').insert({
    user_id: managerUserId,
    event_id: eventId,
    assigned_by: adminUserId,
  });

  // Service window (NOT active "now" — intentionally past, so check-ins are
  // outside the window and should return warnings rather than being blocked)
  await app.inject({
    method: 'POST',
    url: `/events/${eventId}/service-windows`,
    headers: { Authorization: `Bearer ${adminToken}` },
    payload: {
      label: 'Past Service',
      start_at: '2020-01-01T10:00:00+00:00',
      end_at: '2020-01-01T14:00:00+00:00',
    },
  });
  await db('event_materials').insert({
    event_id: eventId,
    material_type: 'rental',
    display_quantity: 1,
    unit: 'units',
  });

  // Submit + approve + in_service
  await app.inject({
    method: 'PATCH',
    url: `/events/${eventId}/state`,
    headers: { Authorization: `Bearer ${adminToken}` },
    payload: { state: 'submitted' },
  });
  await app.inject({
    method: 'PATCH',
    url: `/events/${eventId}/state`,
    headers: { Authorization: `Bearer ${approverToken}` },
    payload: { state: 'approved' },
  });
  await app.inject({
    method: 'PATCH',
    url: `/events/${eventId}/state`,
    headers: { Authorization: `Bearer ${managerToken}` },
    payload: { state: 'in_service' },
  });
}, 30000);

afterAll(async () => {
  if (app) await app.close();
  await teardownTestDb();
  await db.destroy();
}, 30000);

describe('Check-in lifecycle (real DB)', () => {
  describe('POST /events/:id/check-in', () => {
    it('first check-in succeeds (201) and reports warning for outside-window', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/events/${eventId}/check-in`,
        headers: { Authorization: `Bearer ${managerToken}` },
        payload: { attendee_label: 'Guest A' },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.data.occupancy).toBe(1);
      // The only service window is in 2020; "now" is outside it.
      expect(body.data.warning).toBe(true);
    });

    it('returns 422 at capacity when no over_cap_reason is provided', async () => {
      // The event headcount is 1 and we already checked one person in
      const res = await app.inject({
        method: 'POST',
        url: `/events/${eventId}/check-in`,
        headers: { Authorization: `Bearer ${managerToken}` },
        payload: { attendee_label: 'Over Capacity Guest' },
      });
      expect(res.statusCode).toBe(422);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('OVER_CAPACITY');
    });

    it('over-capacity check-in succeeds (201) with over_cap_reason', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/events/${eventId}/check-in`,
        headers: { Authorization: `Bearer ${managerToken}` },
        payload: {
          attendee_label: 'VIP Guest',
          over_cap_reason: 'Approved walk-in',
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.data.warning).toBe(true);
    });
  });

  describe('GET /events/:id/check-in', () => {
    it('returns check-ins + occupancy for scoped manager (200)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/events/${eventId}/check-in`,
        headers: { Authorization: `Bearer ${managerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(Array.isArray(body.data.checkIns)).toBe(true);
      expect(typeof body.data.occupancy).toBe('number');
    });

    it('returns 403 for a non-scoped non-admin user (planner)', async () => {
      // Planner has event:read but no scope on this event and is not the creator
      const res = await app.inject({
        method: 'GET',
        url: `/events/${eventId}/check-in`,
        headers: { Authorization: `Bearer ${plannerToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
