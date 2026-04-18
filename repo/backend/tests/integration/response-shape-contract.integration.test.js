/**
 * Response Shape Contract Integration Tests
 *
 * Asserts the exact response shape the frontend consumes for events and
 * attachments. The frontend unwraps `response.data` uniformly; if the backend
 * stops wrapping, these tests catch it.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, getApp, loginAs, db } from './setup.js';

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
  await db.destroy();
}, 30000);

describe('Event response shape contract (real DB)', () => {
  let createdEventId;

  it('POST /events wraps the created event under `data`', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/events',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        title: 'Contract Test Event',
        event_date: '2025-12-10',
        headcount: 20,
        budget_amount: 1500,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    // Exact shape the frontend consumes: { data: { id, title, ... } }
    expect(body).toHaveProperty('data');
    expect(body.data).toHaveProperty('id');
    expect(body.data).toHaveProperty('title', 'Contract Test Event');
    expect(body.data).toHaveProperty('state');
    createdEventId = body.data.id;
  });

  it('GET /events/:id wraps detail under `data` with sub-resources', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/events/${createdEventId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('data');
    expect(body.data).toHaveProperty('id', createdEventId);
    expect(body.data).toHaveProperty('service_windows');
    expect(body.data).toHaveProperty('materials');
    expect(body.data).toHaveProperty('resource_requests');
    expect(Array.isArray(body.data.service_windows)).toBe(true);
    expect(Array.isArray(body.data.materials)).toBe(true);
    expect(Array.isArray(body.data.resource_requests)).toBe(true);
  });
});

describe('Attachments response shape contract (real DB)', () => {
  it('GET /attachments?event_id=... returns an array under `data`', async () => {
    // Create an event so we have a valid event_id reference
    const eventRes = await app.inject({
      method: 'POST',
      url: '/events',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        title: 'Attachments Contract Event',
        event_date: '2025-12-11',
        headcount: 10,
        budget_amount: 500,
      },
    });
    const eventId = JSON.parse(eventRes.payload).data.id;

    const res = await app.inject({
      method: 'GET',
      url: `/attachments?event_id=${eventId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
  });
});
