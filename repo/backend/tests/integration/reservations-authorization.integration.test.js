/**
 * Reservations Authorization Integration Tests
 *
 * Covers the 403 gaps on /reservations list and /reservations/:id:
 *   - a user without `reservation:read` is rejected at the permission gate
 *   - a user with `reservation:read` but no manager scope (and who is not
 *     the reservation creator) is rejected at the object-level gate for
 *     a specific reservation they don't own
 *   - the list endpoint safely scopes out unrelated reservations
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, getApp, loginAs } from './setup.js';
import db from '../../src/db/connection.js';

let app;
let adminToken, plannerToken, managerToken, editorToken;
let eventId;
let resourceId;
let reservationId;

beforeAll(async () => {
  await setupTestDb();
  app = await getApp();

  adminToken = await loginAs(app, 'admin', 'admin123!');
  plannerToken = await loginAs(app, 'planner', 'planner123!');
  managerToken = await loginAs(app, 'manager', 'manager123!');
  editorToken = await loginAs(app, 'chef', 'chef123!');

  // Admin creates an event
  const eventRes = await app.inject({
    method: 'POST',
    url: '/events',
    headers: { Authorization: `Bearer ${adminToken}` },
    payload: {
      title: 'Reservations AuthZ Event',
      event_date: '2025-12-20',
      headcount: 30,
      budget_amount: 4000,
    },
  });
  eventId = JSON.parse(eventRes.payload).data.id;

  // Grant manager scope so they can create a reservation
  const adminUser = await db('users').where({ username: 'admin' }).first();
  const managerUser = await db('users').where({ username: 'manager' }).first();
  await db('manager_event_scopes').insert({
    user_id: managerUser.id,
    event_id: eventId,
    assigned_by: adminUser.id,
  });

  // Create a published resource directly (bypasses the catalog routes)
  const [resource] = await db('resources')
    .insert({
      name: 'Conference Room A',
      resource_type: 'room',
      status: 'published',
    })
    .returning('*');
  resourceId = resource.id;

  // Manager creates a reservation on the event they have scope for
  const resRes = await app.inject({
    method: 'POST',
    url: '/reservations',
    headers: { Authorization: `Bearer ${managerToken}` },
    payload: {
      event_id: eventId,
      resource_id: resourceId,
      scheduled_start_at: '2025-12-20T10:00:00+00:00',
      scheduled_end_at: '2025-12-20T14:00:00+00:00',
    },
  });
  expect(resRes.statusCode).toBe(201);
  reservationId = JSON.parse(resRes.payload).data.id;
}, 30000);

afterAll(async () => {
  if (app) await app.close();
  await teardownTestDb();
}, 30000);

describe('Reservations authorization (real DB)', () => {
  it('returns 403 on GET /reservations for a user without reservation:read', async () => {
    // culinary_editor (chef) has no reservation:read permission
    const res = await app.inject({
      method: 'GET',
      url: '/reservations',
      headers: { Authorization: `Bearer ${editorToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 403 on GET /reservations/:id for a user without reservation:read', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/reservations/${reservationId}`,
      headers: { Authorization: `Bearer ${editorToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 403 on GET /reservations/:id for an in-scope role but no scope on the event', async () => {
    // planner has reservation:read but no manager_event_scope on this event,
    // and did not create this reservation, so they must be rejected.
    const res = await app.inject({
      method: 'GET',
      url: `/reservations/${reservationId}`,
      headers: { Authorization: `Bearer ${plannerToken}` },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('FORBIDDEN');
  });

  it('returns 200 on GET /reservations for an in-scope user with an empty scope set', async () => {
    // planner has reservation:read and no scopes — should receive a
    // filtered list (their own created reservations only, which is empty).
    const res = await app.inject({
      method: 'GET',
      url: '/reservations',
      headers: { Authorization: `Bearer ${plannerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.data)).toBe(true);
    // The planner should NOT see the manager's reservation
    const visibleIds = body.data.map((r) => r.id);
    expect(visibleIds).not.toContain(reservationId);
  });

  it('allows the scoped manager to GET their own reservation', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/reservations/${reservationId}`,
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.id).toBe(reservationId);
  });
});
