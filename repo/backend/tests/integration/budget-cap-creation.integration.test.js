/**
 * Budget Cap Enforcement on Event Creation — Integration Tests
 *
 * Tests that budget cap is enforced at event CREATION time (not just update).
 * Runs against real Postgres (no mocks).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, getApp, loginAs } from './setup.js';
import db from '../../src/db/connection.js';

let app;
let plannerToken;
let adminToken;

beforeAll(async () => {
  await setupTestDb();
  app = await getApp();
  plannerToken = await loginAs(app, 'planner', 'planner123!');
  adminToken = await loginAs(app, 'admin', 'admin123!');
}, 30000);

afterAll(async () => {
  if (app) await app.close();
  await teardownTestDb();
}, 30000);

describe('Budget cap enforcement on event creation (real DB)', () => {
  it('rejects event creation when budget exceeds the default cap of 25000', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/events',
      headers: { Authorization: `Bearer ${plannerToken}` },
      payload: {
        title: 'Over Budget Event',
        event_date: '2025-12-15',
        headcount: 50,
        budget_amount: 30000, // exceeds default cap of 25000
      },
    });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('allows event creation when budget is within the default cap', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/events',
      headers: { Authorization: `Bearer ${plannerToken}` },
      payload: {
        title: 'Within Budget Event',
        event_date: '2025-12-15',
        headcount: 50,
        budget_amount: 20000, // within default cap of 25000
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.data).toBeDefined();
    expect(body.data.title).toBe('Within Budget Event');
  });

  it('allows event creation when budget equals the cap exactly', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/events',
      headers: { Authorization: `Bearer ${plannerToken}` },
      payload: {
        title: 'Exact Cap Event',
        event_date: '2025-12-15',
        headcount: 50,
        budget_amount: 25000, // exactly the default cap
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it('rejects a custom budget_cap that exceeds the system cap of 25000', async () => {
    // The system cap cannot be raised at creation time; a budget_override
    // approval is event-scoped and requires the event to exist first.
    const res = await app.inject({
      method: 'POST',
      url: '/events',
      headers: { Authorization: `Bearer ${plannerToken}` },
      payload: {
        title: 'Custom Cap Event',
        event_date: '2025-12-15',
        headcount: 50,
        budget_amount: 30000,
        budget_cap: 50000, // attempted bypass of system cap
      },
    });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects creation when budget exceeds even a custom cap', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/events',
      headers: { Authorization: `Bearer ${plannerToken}` },
      payload: {
        title: 'Exceeds Custom Cap Event',
        event_date: '2025-12-15',
        headcount: 50,
        budget_amount: 60000,
        budget_cap: 50000, // explicit cap but budget still exceeds it
      },
    });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('persists budget_cap correctly in the database after creation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/events',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        title: 'Cap Persistence Check',
        event_date: '2025-12-15',
        headcount: 25,
        budget_amount: 5000,
        budget_cap: 15000,
      },
    });
    expect(res.statusCode).toBe(201);
    const eventId = JSON.parse(res.payload).data.id;

    // Verify the budget_cap was persisted correctly in the DB
    const dbEvent = await db('events').where({ id: eventId }).first();
    expect(dbEvent).toBeDefined();
    expect(Number(dbEvent.budget_cap)).toBe(15000);
    expect(Number(dbEvent.budget_amount)).toBe(5000);
  });

  it('defaults budget_cap to 25000 when not explicitly provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/events',
      headers: { Authorization: `Bearer ${plannerToken}` },
      payload: {
        title: 'Default Cap Check',
        event_date: '2025-12-15',
        headcount: 10,
        budget_amount: 1000,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(Number(body.data.budget_cap)).toBe(25000);
  });
});
