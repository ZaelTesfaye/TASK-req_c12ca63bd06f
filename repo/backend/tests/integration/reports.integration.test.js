/**
 * Reports Route Integration Tests
 *
 * Covers GET /reports/inventory/export, /events/export, /approvals/export
 * against the real DB — CSV output, headers, and role gating.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, getApp, loginAs } from './setup.js';
import db from '../../src/db/connection.js';

let app;
let adminToken, analystToken, chefToken;

beforeAll(async () => {
  await setupTestDb();
  app = await getApp();
  adminToken = await loginAs(app, 'admin', 'admin123!');
  analystToken = await loginAs(app, 'analyst', 'analyst123!');
  chefToken = await loginAs(app, 'chef', 'chef123!');

  // The inventory export service blocks with 409 UNRESOLVED_GAPS if ANY
  // inventory item is missing a snapshot for ANY day in the requested
  // range. Seed 004_sample_data.js also inserts items (Flour, Chicken,
  // Olive Oil, Tables, Chairs). To make the happy-path test pass we
  // need to guarantee EVERY existing item has a snapshot for EVERY day
  // in the narrow window the test queries. We pick a single date and
  // backfill a snapshot for every item on that date.
  const [item] = await db('inventory_items')
    .insert({
      name: 'Report Test Flour',
      kind: 'ingredient',
      unit: 'kg',
      current_quantity: 50,
      current_unit_price: 3,
    })
    .returning('*');

  const allItems = await db('inventory_items').select('id');
  const snapshotRows = allItems.map(({ id }) => ({
    item_id: id,
    snapshot_date: '2025-06-10',
    quantity: 50,
    unit_price: 3,
  }));
  await db('inventory_snapshots')
    .insert(snapshotRows)
    .onConflict(['item_id', 'snapshot_date'])
    .ignore();
}, 30000);

afterAll(async () => {
  if (app) await app.close();
  await teardownTestDb();
}, 30000);

describe('GET /reports/inventory/export (real DB)', () => {
  it('returns 200 with Content-Type: text/csv and non-empty body', async () => {
    // Single-day window that matches the snapshot beforeAll seeded for
    // every inventory item — zero gaps, so the export is allowed through.
    const res = await app.inject({
      method: 'GET',
      url: '/reports/inventory/export?from_date=2025-06-10&to_date=2025-06-10',
      headers: { Authorization: `Bearer ${analystToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.payload.length).toBeGreaterThan(0);
  });

  it('returns 403 for a role without inventory:export', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/reports/inventory/export?from_date=2025-06-10&to_date=2025-06-10',
      headers: { Authorization: `Bearer ${chefToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 409 UNRESOLVED_GAPS when snapshots are missing for days in the range', async () => {
    // Seed a second item with no snapshots. Any date without a snapshot
    // surfaces as an unresolved gap and blocks the inventory export.
    const [gapItem] = await db('inventory_items')
      .insert({
        name: 'Gap Block Item',
        kind: 'ingredient',
        unit: 'kg',
        current_quantity: 0,
        current_unit_price: 1,
      })
      .returning('*');

    try {
      const res = await app.inject({
        method: 'GET',
        url: '/reports/inventory/export?from_date=2026-02-10&to_date=2026-02-11&format=csv',
        headers: { Authorization: `Bearer ${analystToken}` },
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('UNRESOLVED_GAPS');
      expect(body.details?.gaps).toBeDefined();
      expect(Array.isArray(body.details.gaps)).toBe(true);
      expect(body.details.gaps.length).toBeGreaterThan(0);
    } finally {
      await db('inventory_items').where({ id: gapItem.id }).delete();
    }
  });
});

describe('GET /reports/events/export (real DB)', () => {
  it('returns 200 with CSV content type for admin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/reports/events/export',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
  });

  it('honors the date-range query params without error', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/reports/events/export?from_date=2025-01-01&to_date=2025-12-31',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toContain('2025-01-01_2025-12-31.csv');
  });
});

describe('GET /reports/approvals/export (real DB)', () => {
  it('returns 200 with CSV content type for admin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/reports/approvals/export',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
  });

  it('returns 403 for a role without reports:export', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/reports/approvals/export',
      headers: { Authorization: `Bearer ${chefToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
