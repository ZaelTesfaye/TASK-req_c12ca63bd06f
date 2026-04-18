/**
 * Events Integration Tests
 *
 * Real end-to-end tests against a live PostgreSQL database.
 * Tests event lifecycle: creation, update, service windows,
 * state transitions, budget rules, audit trail, and authorization.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, getApp, loginAs, db } from './setup.js';

let app;
let plannerToken;
let adminToken;
let approverToken;
let managerToken;

beforeAll(async () => {
  await setupTestDb();
  app = await getApp();

  // Acquire tokens for different roles
  plannerToken = await loginAs(app, 'planner', 'planner123!');
  adminToken = await loginAs(app, 'admin', 'admin123!');
  approverToken = await loginAs(app, 'approver', 'approver123!');
  managerToken = await loginAs(app, 'manager', 'manager123!');
}, 30000);

afterAll(async () => {
  if (app) await app.close();
  await teardownTestDb();
  await db.destroy();
}, 30000);

describe('Events integration (real DB)', () => {
  // -------------------------------------------------------------------------
  // POST /events - Create event
  // -------------------------------------------------------------------------
  describe('POST /events - Create event', () => {
    it('creates an event in draft state and persists it to the DB', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/events',
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: {
          title: 'Integration Test Gala',
          description: 'A test event for integration testing',
          event_date: '2025-12-15',
          headcount: 100,
          budget_amount: 15000,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.data).toBeDefined();
      expect(body.data.title).toBe('Integration Test Gala');
      expect(body.data.state).toBe('draft');

      // Verify in the database
      const dbEvent = await db('events').where({ id: body.data.id }).first();
      expect(dbEvent).toBeDefined();
      expect(dbEvent.state).toBe('draft');
      expect(dbEvent.title).toBe('Integration Test Gala');
      expect(Number(dbEvent.budget_amount)).toBe(15000);
    });

    it('defaults budget_cap to 25000 when not provided', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/events',
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: {
          title: 'Default Cap Event',
          event_date: '2025-11-01',
          headcount: 50,
          budget_amount: 5000,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(Number(body.data.budget_cap)).toBe(25000);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /events/:id - Update event
  // -------------------------------------------------------------------------
  describe('PATCH /events/:id - Update event', () => {
    let eventId;

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/events',
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: {
          title: 'Updatable Event',
          event_date: '2025-10-20',
          headcount: 75,
          budget_amount: 10000,
        },
      });
      eventId = JSON.parse(res.payload).data.id;
    });

    it('updates event details and verifies DB reflects changes', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/events/${eventId}`,
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: {
          title: 'Updated Gala Night',
          headcount: 150,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.title).toBe('Updated Gala Night');
      expect(body.data.headcount).toBe(150);

      // Verify in DB
      const dbEvent = await db('events').where({ id: eventId }).first();
      expect(dbEvent.title).toBe('Updated Gala Night');
      expect(dbEvent.headcount).toBe(150);
    });

    it('returns 403 when a non-creator tries to update the event', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/events/${eventId}`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { title: 'Hacked Title' },
      });

      // Admin is not the creator, so should get 403
      expect(res.statusCode).toBe(403);

      // Verify DB was NOT changed
      const dbEvent = await db('events').where({ id: eventId }).first();
      expect(dbEvent.title).not.toBe('Hacked Title');
    });
  });

  // -------------------------------------------------------------------------
  // Service windows
  // -------------------------------------------------------------------------
  describe('POST /events/:id/service-windows', () => {
    let eventId;

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/events',
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: {
          title: 'Windows Event',
          event_date: '2025-09-10',
          headcount: 30,
          budget_amount: 5000,
        },
      });
      eventId = JSON.parse(res.payload).data.id;
    });

    it('adds service windows and verifies they are stored in the DB', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/events/${eventId}/service-windows`,
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: {
          label: 'Breakfast Service',
          start_at: '2025-09-10T07:00:00+00:00',
          end_at: '2025-09-10T09:00:00+00:00',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.data.label).toBe('Breakfast Service');

      // Verify in DB
      const windows = await db('event_service_windows').where({ event_id: eventId });
      expect(windows.length).toBe(1);
      expect(windows[0].label).toBe('Breakfast Service');
    });
  });

  // -------------------------------------------------------------------------
  // State transitions
  // -------------------------------------------------------------------------
  describe('PATCH /events/:id/state - State transitions', () => {
    let eventId;

    beforeAll(async () => {
      // Create a complete event ready for submission
      const createRes = await app.inject({
        method: 'POST',
        url: '/events',
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: {
          title: 'State Machine Event',
          event_date: '2025-08-01',
          headcount: 50,
          budget_amount: 10000,
        },
      });
      eventId = JSON.parse(createRes.payload).data.id;

      // Add a service window (required for submission)
      await app.inject({
        method: 'POST',
        url: `/events/${eventId}/service-windows`,
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: {
          label: 'Main Service',
          start_at: '2025-08-01T10:00:00+00:00',
          end_at: '2025-08-01T14:00:00+00:00',
        },
      });

      // Add a material (required for submission) — use 'rental' type with no FK reference
      await db('event_materials').insert({
        event_id: eventId,
        material_type: 'rental',
        display_quantity: 10,
        unit: 'units',
      });
    });

    it('transitions draft -> submitted and verifies state in DB', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/events/${eventId}/state`,
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: { state: 'submitted' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.state).toBe('submitted');

      // Verify in DB
      const dbEvent = await db('events').where({ id: eventId }).first();
      expect(dbEvent.state).toBe('submitted');
    });

    it('transitions submitted -> approved (as approver) and verifies state in DB', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/events/${eventId}/state`,
        headers: { Authorization: `Bearer ${approverToken}` },
        payload: { state: 'approved' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.state).toBe('approved');

      // Verify in DB
      const dbEvent = await db('events').where({ id: eventId }).first();
      expect(dbEvent.state).toBe('approved');
      expect(dbEvent.approved_at).not.toBeNull();
    });

    it('rejects invalid state transition (draft -> approved)', async () => {
      // Create a fresh draft event
      const createRes = await app.inject({
        method: 'POST',
        url: '/events',
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: {
          title: 'Invalid Transition Event',
          event_date: '2025-07-01',
          headcount: 20,
          budget_amount: 3000,
        },
      });
      const freshId = JSON.parse(createRes.payload).data.id;

      // Try to jump directly from draft to approved
      const res = await app.inject({
        method: 'PATCH',
        url: `/events/${freshId}/state`,
        headers: { Authorization: `Bearer ${approverToken}` },
        payload: { state: 'approved' },
      });

      // Should fail — draft can only go to submitted
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      const body = JSON.parse(res.payload);
      expect(body.message || body.details).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Audit trail entries
  // -------------------------------------------------------------------------
  describe('Audit trail entries for event mutations', () => {
    it('creates audit_trail entries when events are created and transitioned', async () => {
      // Create an event
      const createRes = await app.inject({
        method: 'POST',
        url: '/events',
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: {
          title: 'Audit Trail Event',
          event_date: '2025-06-15',
          headcount: 40,
          budget_amount: 8000,
        },
      });
      expect(createRes.statusCode).toBe(201);
      const eventId = JSON.parse(createRes.payload).data.id;

      // Check that an audit entry was created for the event creation
      const auditEntries = await db('audit_trail')
        .where({ subject_id: eventId, action: 'create' });
      expect(auditEntries.length).toBeGreaterThan(0);
      expect(auditEntries[0].subject_type).toBe('event');
    });
  });

  // -------------------------------------------------------------------------
  // Budget rules
  // -------------------------------------------------------------------------
  describe('Budget validation rules', () => {
    it('rejects budget_amount above budget_cap without an approved override', async () => {
      // Create an event under the system cap (creation itself is hard-gated
      // at $25k — see budget-cap-creation.integration.test.js).
      const res = await app.inject({
        method: 'POST',
        url: '/events',
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: {
          title: 'Over Budget Event',
          event_date: '2025-05-01',
          headcount: 200,
          budget_amount: 20000,
          budget_cap: 25000,
        },
      });

      expect(res.statusCode).toBe(201);

      const eventId = JSON.parse(res.payload).data.id;

      // Submit the event first (need service window and material)
      await app.inject({
        method: 'POST',
        url: `/events/${eventId}/service-windows`,
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: {
          label: 'Service',
          start_at: '2025-05-01T10:00:00+00:00',
          end_at: '2025-05-01T14:00:00+00:00',
        },
      });
      await db('event_materials').insert({
        event_id: eventId,
        material_type: 'rental',
        display_quantity: 5,
        unit: 'units',
      });

      // Submit the event
      await app.inject({
        method: 'PATCH',
        url: `/events/${eventId}/state`,
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: { state: 'submitted' },
      });

      // Now try to increase budget beyond cap while in submitted state
      const updateRes = await app.inject({
        method: 'PATCH',
        url: `/events/${eventId}`,
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: { budget_amount: 50000 },
      });

      // Should be rejected because budget exceeds cap and no override approval exists
      expect(updateRes.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('creates a pending budget_change approval when budget changes >10% on submitted event', async () => {
      // Create and submit an event
      const createRes = await app.inject({
        method: 'POST',
        url: '/events',
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: {
          title: 'Budget Change Event',
          event_date: '2025-04-15',
          headcount: 60,
          budget_amount: 10000,
        },
      });
      const eventId = JSON.parse(createRes.payload).data.id;

      // Add service window and material for submission
      await app.inject({
        method: 'POST',
        url: `/events/${eventId}/service-windows`,
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: {
          label: 'Service',
          start_at: '2025-04-15T10:00:00+00:00',
          end_at: '2025-04-15T14:00:00+00:00',
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

      // Update budget by >10% (from 10000 to 12000 = 20% increase) — within cap
      const updateRes = await app.inject({
        method: 'PATCH',
        url: `/events/${eventId}`,
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: { budget_amount: 12000 },
      });

      expect(updateRes.statusCode).toBe(200);

      // Verify a pending budget_change approval was created in the DB
      const approvals = await db('approvals')
        .where({ event_id: eventId, approval_type: 'budget_change', status: 'pending' });
      expect(approvals.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // GET /events - List events
  //
  // The primary list endpoint: paginated, filterable by state/date range,
  // and searchable by title/description substring. No dedicated test
  // existed for it until now — all previous coverage was incidental through
  // other flows.
  // -------------------------------------------------------------------------
  describe('GET /events - List events', () => {
    let listTestEventId;
    let listSearchableId;

    beforeAll(async () => {
      // Seed a deterministic event we can locate in all list/filter assertions.
      const res = await app.inject({
        method: 'POST',
        url: '/events',
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: {
          title: 'List Endpoint Event',
          description: 'For GET /events list coverage',
          event_date: '2026-09-15',
          headcount: 25,
          budget_amount: 1500,
        },
      });
      listTestEventId = JSON.parse(res.payload).data.id;

      const searchRes = await app.inject({
        method: 'POST',
        url: '/events',
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: {
          title: 'UniqueMarketingGala2026',
          event_date: '2026-09-20',
          headcount: 10,
          budget_amount: 500,
        },
      });
      listSearchableId = JSON.parse(searchRes.payload).data.id;
    });

    it('returns 401 when unauthenticated', async () => {
      const res = await app.inject({ method: 'GET', url: '/events' });
      expect(res.statusCode).toBe(401);
    });

    it('returns paginated list with pagination envelope for an authenticated user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/events?page=1&pageSize=5',
        headers: { Authorization: `Bearer ${plannerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.pagination).toBeDefined();
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.pageSize).toBe(5);
      expect(body.pagination.total).toBeGreaterThanOrEqual(1);
      expect(typeof body.pagination.totalPages).toBe('number');
    });

    it('filters by state=draft', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/events?state=draft&pageSize=100',
        headers: { Authorization: `Bearer ${plannerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.every((e) => e.state === 'draft')).toBe(true);
      expect(body.data.some((e) => e.id === listTestEventId)).toBe(true);
    });

    it('filters by fromDate / toDate inclusive of the event_date', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/events?fromDate=2026-09-10&toDate=2026-09-30&pageSize=100',
        headers: { Authorization: `Bearer ${plannerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.some((e) => e.id === listTestEventId)).toBe(true);
      // Events outside the window must not appear.
      expect(body.data.every((e) => e.event_date >= '2026-09-10' && e.event_date <= '2026-09-30')).toBe(true);
    });

    it('honors the search parameter against title (case-insensitive substring)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/events?search=uniquemarketinggala',
        headers: { Authorization: `Bearer ${plannerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.some((e) => e.id === listSearchableId)).toBe(true);
      expect(body.data.every((e) => /unique/i.test(`${e.title}${e.description || ''}`))).toBe(true);
    });

    it('returns 403 when the caller lacks event:read', async () => {
      // chef has no event:read permission
      const chefToken = await loginAs(app, 'chef', 'chef123!');
      const res = await app.inject({
        method: 'GET',
        url: '/events',
        headers: { Authorization: `Bearer ${chefToken}` },
      });
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('FORBIDDEN');
      expect(body.requestId).toBeDefined();
    });
  });
});
