/**
 * Inventory Routes Integration Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, getApp, loginAs } from './setup.js';
import db from '../../src/db/connection.js';

let app;
let analystToken, plannerToken;
let itemId;

beforeAll(async () => {
  await setupTestDb();
  app = await getApp();
  analystToken = await loginAs(app, 'analyst', 'analyst123!');
  plannerToken = await loginAs(app, 'planner', 'planner123!');

  const [item] = await db('inventory_items')
    .insert({
      name: 'Test Flour',
      kind: 'ingredient',
      unit: 'kg',
      current_quantity: 100,
      current_unit_price: 2,
    })
    .returning('*');
  itemId = item.id;
}, 30000);

afterAll(async () => {
  if (app) await app.close();
  await teardownTestDb();
}, 30000);

describe('GET /inventory/items (real DB)', () => {
  it('returns a paginated list of items', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/inventory/items?page=1&pageSize=10',
      headers: { Authorization: `Bearer ${analystToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination).toBeDefined();
    expect(body.data.some((i) => i.id === itemId)).toBe(true);
  });

  it('filters by kind=ingredient', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/inventory/items?kind=ingredient',
      headers: { Authorization: `Bearer ${analystToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.every((i) => i.kind === 'ingredient')).toBe(true);
  });

  it('filters by search term', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/inventory/items?search=Test%20Flour',
      headers: { Authorization: `Bearer ${analystToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.some((i) => i.name === 'Test Flour')).toBe(true);
  });
});

describe('GET /inventory/snapshots (real DB)', () => {
  beforeAll(async () => {
    await db('inventory_snapshots').insert([
      {
        item_id: itemId,
        snapshot_date: '2025-06-01',
        quantity: 100,
        unit_price: 2,
      },
      {
        item_id: itemId,
        snapshot_date: '2025-06-02',
        quantity: 95,
        unit_price: 2,
      },
    ]);
  });

  it('returns a snapshot list within the date range', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/inventory/snapshots?from_date=2025-06-01&to_date=2025-06-30',
      headers: { Authorization: `Bearer ${analystToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(2);
  });

  it('narrows results via date-range filtering', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/inventory/snapshots?from_date=2025-06-01&to_date=2025-06-01',
      headers: { Authorization: `Bearer ${analystToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data.length).toBeLessThanOrEqual(2);
  });
});

describe('GET /inventory/anomalies (real DB)', () => {
  it('returns an anomaly list for a valid date window', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/inventory/anomalies?from_date=2025-06-01&to_date=2025-06-30',
      headers: { Authorization: `Bearer ${analystToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('returns an empty list for a window with no anomalies', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/inventory/anomalies?from_date=2099-01-01&to_date=2099-01-31',
      headers: { Authorization: `Bearer ${analystToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data).toEqual([]);
  });
});

describe('GET /inventory/items/:id (real DB)', () => {
  it('returns the item', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/inventory/items/${itemId}`,
      headers: { Authorization: `Bearer ${analystToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data.id).toBe(itemId);
  });

  it('returns 404 for an unknown item', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/inventory/items/00000000-0000-0000-0000-000000000000',
      headers: { Authorization: `Bearer ${analystToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /inventory/gaps (real DB)', () => {
  it('returns an array scoped to the date range', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/inventory/gaps?from_date=2025-01-01&to_date=2025-12-31',
      headers: { Authorization: `Bearer ${analystToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('returns 422 when the required date-range params are missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/inventory/gaps',
      headers: { Authorization: `Bearer ${analystToken}` },
    });
    expect(res.statusCode).toBe(422);
  });
});

describe('POST /inventory/gaps/:item_id/resolve (real DB)', () => {
  it('resolves a gap for a valid item', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/inventory/gaps/${itemId}/resolve`,
      headers: { Authorization: `Bearer ${analystToken}` },
      payload: {
        missing_date: '2025-06-15',
        notes: 'Verified no receipt that day',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.payload).data.item_id).toBe(itemId);
  });

  it('returns 404 for an unknown item id in the path', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/inventory/gaps/00000000-0000-0000-0000-000000000000/resolve`,
      headers: { Authorization: `Bearer ${analystToken}` },
      payload: {
        missing_date: '2025-06-15',
        notes: 'n/a',
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 for a role without inventory:resolve_gap', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/inventory/gaps/${itemId}/resolve`,
      headers: { Authorization: `Bearer ${plannerToken}` },
      payload: {
        missing_date: '2025-06-16',
        notes: 'n/a',
      },
    });
    expect(res.statusCode).toBe(403);
  });
});
