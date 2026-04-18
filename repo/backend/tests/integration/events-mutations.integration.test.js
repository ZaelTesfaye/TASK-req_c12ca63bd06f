/**
 * Events Mutation Integration Tests
 *
 * Covers POST/DELETE for materials, service windows, resource requests,
 * and GET /events/:id/audit-trail. Paths not covered by the existing
 * events.integration.test.js file.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { setupTestDb, teardownTestDb, getApp, loginAs, db } from './setup.js';

let app;
let plannerToken;
let approverToken;
let chefToken;
let eventId;
let resourceId;

beforeAll(async () => {
  await setupTestDb();
  app = await getApp();

  plannerToken = await loginAs(app, 'planner', 'planner123!');
  approverToken = await loginAs(app, 'approver', 'approver123!');
  chefToken = await loginAs(app, 'chef', 'chef123!');

  // Event
  const eventRes = await app.inject({
    method: 'POST',
    url: '/events',
    headers: { Authorization: `Bearer ${plannerToken}` },
    payload: {
      title: 'Mutation Test Event',
      event_date: '2026-05-10',
      headcount: 40,
      budget_amount: 6000,
    },
  });
  eventId = JSON.parse(eventRes.payload).data.id;

  // A published resource (created directly in DB to avoid catalog-route coupling)
  const [resource] = await db('resources')
    .insert({
      name: 'Event Mutation Test Resource',
      resource_type: 'equipment',
      status: 'published',
      requires_approval: false,
      quota_per_event: null,
    })
    .returning('*');
  resourceId = resource.id;
}, 30000);

afterAll(async () => {
  if (app) await app.close();
  await teardownTestDb();
  await db.destroy();
}, 30000);

describe('Events mutation endpoints (real DB)', () => {
  // -------------------------------------------------------------------------
  // POST /events/:id/materials
  // -------------------------------------------------------------------------
  describe('POST /events/:id/materials', () => {
    it('adds a rental material (201)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/events/${eventId}/materials`,
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: {
          material_type: 'rental',
          display_quantity: 10,
          unit: 'units',
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.data.material_type).toBe('rental');

      const dbRow = await db('event_materials').where({ id: body.data.id }).first();
      expect(dbRow).toBeDefined();
    });

    it('returns 422 when required fields are missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/events/${eventId}/materials`,
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: { material_type: 'rental' }, // missing display_quantity
      });
      expect(res.statusCode).toBe(422);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /events/:id/materials/:materialId
  // -------------------------------------------------------------------------
  describe('DELETE /events/:id/materials/:materialId', () => {
    it('removes an existing material (200)', async () => {
      const [material] = await db('event_materials')
        .insert({
          event_id: eventId,
          material_type: 'rental',
          display_quantity: 5,
          unit: 'units',
        })
        .returning('*');

      const res = await app.inject({
        method: 'DELETE',
        url: `/events/${eventId}/materials/${material.id}`,
        headers: { Authorization: `Bearer ${plannerToken}` },
      });
      expect(res.statusCode).toBe(200);

      const still = await db('event_materials').where({ id: material.id }).first();
      expect(still).toBeUndefined();
    });

    it('returns 404 when the material does not exist', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/events/${eventId}/materials/${randomUUID()}`,
        headers: { Authorization: `Bearer ${plannerToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // POST /events/:id/service-windows  (invalid end <= start)
  // -------------------------------------------------------------------------
  describe('POST /events/:id/service-windows - end_at <= start_at', () => {
    it('rejects when end_at equals start_at (DB CHECK constraint -> non-201)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/events/${eventId}/service-windows`,
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: {
          label: 'Bad Window',
          start_at: '2026-05-10T09:00:00+00:00',
          end_at: '2026-05-10T09:00:00+00:00',
        },
      });
      // The CHECK constraint raises a DB error, which surfaces as a non-201.
      expect(res.statusCode).not.toBe(201);
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /events/:id/service-windows/:windowId
  // -------------------------------------------------------------------------
  describe('DELETE /events/:id/service-windows/:windowId', () => {
    it('removes an existing service window (200)', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: `/events/${eventId}/service-windows`,
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: {
          label: 'Temp Window',
          start_at: '2026-05-10T10:00:00+00:00',
          end_at: '2026-05-10T12:00:00+00:00',
        },
      });
      const windowId = JSON.parse(createRes.payload).data.id;

      const res = await app.inject({
        method: 'DELETE',
        url: `/events/${eventId}/service-windows/${windowId}`,
        headers: { Authorization: `Bearer ${plannerToken}` },
      });
      expect(res.statusCode).toBe(200);

      const still = await db('event_service_windows').where({ id: windowId }).first();
      expect(still).toBeUndefined();
    });

    it('returns 404 when the service window does not exist', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/events/${eventId}/service-windows/${randomUUID()}`,
        headers: { Authorization: `Bearer ${plannerToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // POST /events/:id/resource-requests
  // -------------------------------------------------------------------------
  describe('POST /events/:id/resource-requests', () => {
    it('adds a resource request (201)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/events/${eventId}/resource-requests`,
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: {
          resource_id: resourceId,
          quantity: 1,
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.data.resource_id).toBe(resourceId);
      expect(body.data.quantity).toBe(1);
    });

    it('returns 422 for invalid payload (missing resource_id)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/events/${eventId}/resource-requests`,
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: { quantity: 1 },
      });
      expect(res.statusCode).toBe(422);
    });
  });

  // -------------------------------------------------------------------------
  // GET /events/:id/audit-trail
  // -------------------------------------------------------------------------
  describe('GET /events/:id/audit-trail', () => {
    it('returns paginated audit entries (200) for the approver (has audit:read)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/events/${eventId}/audit-trail`,
        headers: { Authorization: `Bearer ${approverToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.pagination).toBeDefined();
    });

    it('returns 403 for a user without audit:read (chef)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/events/${eventId}/audit-trail`,
        headers: { Authorization: `Bearer ${chefToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
