/**
 * Authorization Gaps Integration Tests
 *
 * Tests for authorization gaps being fixed: check-in permissions,
 * entitlement ownership on redemption, and role-based access control.
 * Runs against real Postgres (no mocks).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { setupTestDb, teardownTestDb, getApp, loginAs } from './setup.js';
import db from '../../src/db/connection.js';

let app;
let adminToken, plannerToken, managerToken, editorToken, approverToken;

beforeAll(async () => {
  await setupTestDb();
  app = await getApp();
  adminToken = await loginAs(app, 'admin', 'admin123!');
  plannerToken = await loginAs(app, 'planner', 'planner123!');
  managerToken = await loginAs(app, 'manager', 'manager123!');
  editorToken = await loginAs(app, 'chef', 'chef123!');
  approverToken = await loginAs(app, 'approver', 'approver123!');
}, 30000);

afterAll(async () => {
  if (app) await app.close();
  await teardownTestDb();
}, 30000);

describe('Check-in authorization (real DB)', () => {
  let eventId;

  beforeAll(async () => {
    // Create an event as admin (admin has event:create)
    const eventRes = await app.inject({
      method: 'POST',
      url: '/events',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        title: 'CheckIn Auth Test Event',
        event_date: '2025-12-01',
        headcount: 10,
        budget_amount: 1000,
      },
    });
    expect(eventRes.statusCode).toBe(201);
    eventId = JSON.parse(eventRes.payload).data.id;

    // Grant the resource_manager scope on this event so the object-level
    // eligibility check passes when they perform check-in operations.
    const adminUser = await db('users').where({ username: 'admin' }).first();
    const managerUser = await db('users').where({ username: 'manager' }).first();
    await db('manager_event_scopes').insert({
      user_id: managerUser.id,
      event_id: eventId,
      assigned_by: adminUser.id,
    });

    // Add service window and material for submission
    await app.inject({
      method: 'POST',
      url: `/events/${eventId}/service-windows`,
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        label: 'Main Service',
        start_at: '2025-12-01T10:00:00+00:00',
        end_at: '2025-12-01T14:00:00+00:00',
      },
    });
    await db('event_materials').insert({
      event_id: eventId,
      material_type: 'rental',
      display_quantity: 5,
      unit: 'units',
    });

    // Submit the event (admin has event:create -> can submit their own event)
    await app.inject({
      method: 'PATCH',
      url: `/events/${eventId}/state`,
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: { state: 'submitted' },
    });

    // Approve the event (approver has event:approve)
    await app.inject({
      method: 'PATCH',
      url: `/events/${eventId}/state`,
      headers: { Authorization: `Bearer ${approverToken}` },
      payload: { state: 'approved' },
    });

    // Move to in_service (manager has event:service)
    await app.inject({
      method: 'PATCH',
      url: `/events/${eventId}/state`,
      headers: { Authorization: `Bearer ${managerToken}` },
      payload: { state: 'in_service' },
    });
  });

  it('culinary_editor (chef) without event:service permission gets 403 on check-in', async () => {
    // The culinary_editor role does NOT have event:service permission
    const res = await app.inject({
      method: 'POST',
      url: `/events/${eventId}/check-in`,
      headers: { Authorization: `Bearer ${editorToken}` },
      payload: { attendee_label: 'Test Guest' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('resource_manager (with event:service permission) can perform check-in', async () => {
    // The resource_manager role HAS event:service permission
    const res = await app.inject({
      method: 'POST',
      url: `/events/${eventId}/check-in`,
      headers: { Authorization: `Bearer ${managerToken}` },
      payload: { attendee_label: 'Authorized Guest' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.data).toBeDefined();
  });

  it('admin (with all permissions) can perform check-in', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/events/${eventId}/check-in`,
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: { attendee_label: 'Admin Guest' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('unauthenticated request gets 401 on check-in', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/events/${eventId}/check-in`,
      payload: { attendee_label: 'No Auth Guest' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('Entitlement ownership enforcement (real DB)', () => {
  let adminEntitlementId;
  let entitlementTypeId;
  let adminUserId;
  let plannerUserId;

  beforeAll(async () => {
    // Fetch user IDs
    const adminUser = await db('users').where({ username: 'admin' }).first();
    adminUserId = adminUser.id;
    const plannerUser = await db('users').where({ username: 'planner' }).first();
    plannerUserId = plannerUser.id;

    // Fetch an entitlement type
    const staffMealType = await db('entitlement_types').where({ code: 'staff_meal' }).first();
    entitlementTypeId = staffMealType.id;

    // Create an event for the entitlement
    const eventRes = await app.inject({
      method: 'POST',
      url: '/events',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        title: 'Entitlement Ownership Test',
        event_date: '2025-12-01',
        headcount: 20,
        budget_amount: 2000,
      },
    });
    const eventId = JSON.parse(eventRes.payload).data.id;

    // Issue an entitlement to the admin user (not planner)
    const issueRes = await app.inject({
      method: 'POST',
      url: '/entitlements/issue-manual',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        event_id: eventId,
        user_id: adminUserId,
        entitlement_type_id: entitlementTypeId,
        quantity_total: 10,
      },
    });
    expect(issueRes.statusCode).toBe(201);
    adminEntitlementId = JSON.parse(issueRes.payload).data.id;
  });

  it('entitlement owner (admin) can redeem their own entitlement', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/entitlements/${adminEntitlementId}/redeem`,
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        quantity: 1,
        idempotency_key: randomUUID(),
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.success).toBe(true);
  });

  it('non-owner (planner) cannot redeem another users entitlement', async () => {
    // Planner has entitlement:redeem permission but does NOT own this entitlement
    const res = await app.inject({
      method: 'POST',
      url: `/entitlements/${adminEntitlementId}/redeem`,
      headers: { Authorization: `Bearer ${plannerToken}` },
      payload: {
        quantity: 1,
        idempotency_key: randomUUID(),
      },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('FORBIDDEN');
  });

  it('non-owner without redeem permission gets 403', async () => {
    // culinary_editor (chef) does not have entitlement:redeem
    const res = await app.inject({
      method: 'POST',
      url: `/entitlements/${adminEntitlementId}/redeem`,
      headers: { Authorization: `Bearer ${editorToken}` },
      payload: {
        quantity: 1,
        idempotency_key: randomUUID(),
      },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('Role-based access control on event operations (real DB)', () => {
  it('culinary_editor cannot create events (no event:create permission)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/events',
      headers: { Authorization: `Bearer ${editorToken}` },
      payload: {
        title: 'Should Not Be Created',
        event_date: '2025-12-01',
        headcount: 5,
        budget_amount: 500,
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('inventory_analyst cannot create events', async () => {
    const analystToken = await loginAs(app, 'analyst', 'analyst123!');
    const res = await app.inject({
      method: 'POST',
      url: '/events',
      headers: { Authorization: `Bearer ${analystToken}` },
      payload: {
        title: 'Analyst Attempt',
        event_date: '2025-12-01',
        headcount: 5,
        budget_amount: 500,
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('planner cannot approve events (no event:approve permission)', async () => {
    // Create and submit an event first
    const createRes = await app.inject({
      method: 'POST',
      url: '/events',
      headers: { Authorization: `Bearer ${plannerToken}` },
      payload: {
        title: 'Planner Approve Attempt',
        event_date: '2025-12-01',
        headcount: 10,
        budget_amount: 1000,
      },
    });
    const eventId = JSON.parse(createRes.payload).data.id;

    // Add required service window and material
    await app.inject({
      method: 'POST',
      url: `/events/${eventId}/service-windows`,
      headers: { Authorization: `Bearer ${plannerToken}` },
      payload: {
        label: 'Service',
        start_at: '2025-12-01T10:00:00+00:00',
        end_at: '2025-12-01T14:00:00+00:00',
      },
    });
    await db('event_materials').insert({
      event_id: eventId,
      material_type: 'rental',
      display_quantity: 3,
      unit: 'units',
    });

    // Submit
    await app.inject({
      method: 'PATCH',
      url: `/events/${eventId}/state`,
      headers: { Authorization: `Bearer ${plannerToken}` },
      payload: { state: 'submitted' },
    });

    // Planner tries to approve -- should fail
    const approveRes = await app.inject({
      method: 'PATCH',
      url: `/events/${eventId}/state`,
      headers: { Authorization: `Bearer ${plannerToken}` },
      payload: { state: 'approved' },
    });
    expect(approveRes.statusCode).toBe(403);
  });

  it('approver role CAN approve submitted events', async () => {
    // Create event as planner
    const createRes = await app.inject({
      method: 'POST',
      url: '/events',
      headers: { Authorization: `Bearer ${plannerToken}` },
      payload: {
        title: 'Approver Test Event',
        event_date: '2025-12-01',
        headcount: 10,
        budget_amount: 1000,
      },
    });
    const eventId = JSON.parse(createRes.payload).data.id;

    // Add required sub-resources
    await app.inject({
      method: 'POST',
      url: `/events/${eventId}/service-windows`,
      headers: { Authorization: `Bearer ${plannerToken}` },
      payload: {
        label: 'Service',
        start_at: '2025-12-01T10:00:00+00:00',
        end_at: '2025-12-01T14:00:00+00:00',
      },
    });
    await db('event_materials').insert({
      event_id: eventId,
      material_type: 'rental',
      display_quantity: 3,
      unit: 'units',
    });

    // Submit as planner
    await app.inject({
      method: 'PATCH',
      url: `/events/${eventId}/state`,
      headers: { Authorization: `Bearer ${plannerToken}` },
      payload: { state: 'submitted' },
    });

    // Approve as approver -- should succeed
    const approveRes = await app.inject({
      method: 'PATCH',
      url: `/events/${eventId}/state`,
      headers: { Authorization: `Bearer ${approverToken}` },
      payload: { state: 'approved' },
    });
    expect(approveRes.statusCode).toBe(200);
    const body = JSON.parse(approveRes.payload);
    expect(body.data.state).toBe('approved');
  });
});
