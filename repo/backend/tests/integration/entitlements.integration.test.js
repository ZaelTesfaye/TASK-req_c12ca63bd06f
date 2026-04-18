/**
 * Entitlements Integration Tests
 *
 * Real end-to-end tests against a live PostgreSQL database.
 * Tests manual issuance, redemption (including idempotency),
 * expiry handling, and quantity constraints.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { setupTestDb, teardownTestDb, getApp, loginAs } from './setup.js';
import db from '../../src/db/connection.js';

let app;
let adminToken;
let plannerToken;
let eventId;
let entitlementTypeId;
let plannerUserId;

beforeAll(async () => {
  await setupTestDb();
  app = await getApp();

  adminToken = await loginAs(app, 'admin', 'admin123!');
  plannerToken = await loginAs(app, 'planner', 'planner123!');

  // Fetch planner's user ID
  const plannerUser = await db('users').where({ username: 'planner' }).first();
  plannerUserId = plannerUser.id;

  // Fetch an entitlement type (seeded by 003_entitlement_types_rules)
  const staffMealType = await db('entitlement_types').where({ code: 'staff_meal' }).first();
  entitlementTypeId = staffMealType.id;

  // Create an event to link entitlements to (admin has event:create permission)
  const createRes = await app.inject({
    method: 'POST',
    url: '/events',
    headers: { Authorization: `Bearer ${adminToken}` },
    payload: {
      title: 'Entitlement Test Event',
      event_date: '2025-12-01',
      headcount: 50,
      budget_amount: 5000,
    },
  });
  eventId = JSON.parse(createRes.payload).data.id;
}, 30000);

afterAll(async () => {
  if (app) await app.close();
  await teardownTestDb();
}, 30000);

describe('Entitlements integration (real DB)', () => {
  // -------------------------------------------------------------------------
  // POST /entitlements/issue-manual
  // -------------------------------------------------------------------------
  describe('POST /entitlements/issue-manual', () => {
    it('issues an entitlement manually and verifies it in the DB', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/entitlements/issue-manual',
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: {
          event_id: eventId,
          user_id: plannerUserId,
          entitlement_type_id: entitlementTypeId,
          quantity_total: 10,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.data).toBeDefined();
      expect(body.data.id).toBeDefined();
      expect(Number(body.data.quantity_total)).toBe(10);
      expect(Number(body.data.quantity_remaining)).toBe(10);
      expect(body.data.issuance_mode).toBe('manual');

      // Verify in the database
      const dbEntitlement = await db('entitlements').where({ id: body.data.id }).first();
      expect(dbEntitlement).toBeDefined();
      expect(Number(dbEntitlement.quantity_total)).toBe(10);
      expect(Number(dbEntitlement.quantity_remaining)).toBe(10);
      expect(dbEntitlement.user_id).toBe(plannerUserId);
      expect(dbEntitlement.event_id).toBe(eventId);
    });
  });

  // -------------------------------------------------------------------------
  // POST /entitlements/:id/redeem
  // -------------------------------------------------------------------------
  describe('POST /entitlements/:id/redeem', () => {
    let entitlementId;

    beforeAll(async () => {
      // Issue a fresh entitlement with quantity 5
      const res = await app.inject({
        method: 'POST',
        url: '/entitlements/issue-manual',
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: {
          event_id: eventId,
          user_id: plannerUserId,
          entitlement_type_id: entitlementTypeId,
          quantity_total: 5,
        },
      });
      entitlementId = JSON.parse(res.payload).data.id;
    });

    it('redeems an entitlement and verifies quantity_remaining decreased in DB', async () => {
      const idempotencyKey = randomUUID();
      const res = await app.inject({
        method: 'POST',
        url: `/entitlements/${entitlementId}/redeem`,
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: {
          quantity: 2,
          idempotency_key: idempotencyKey,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.success).toBe(true);
      expect(body.data.remaining).toBe(3);

      // Verify quantity_remaining decreased in DB
      const dbEntitlement = await db('entitlements').where({ id: entitlementId }).first();
      expect(Number(dbEntitlement.quantity_remaining)).toBe(3);
    });

    it('returns same result with same idempotency key (no double decrement)', async () => {
      const idempotencyKey = randomUUID();

      // First redemption
      const first = await app.inject({
        method: 'POST',
        url: `/entitlements/${entitlementId}/redeem`,
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: {
          quantity: 1,
          idempotency_key: idempotencyKey,
        },
      });
      expect(first.statusCode).toBe(200);
      const firstBody = JSON.parse(first.payload);
      expect(firstBody.data.success).toBe(true);
      const remainingAfterFirst = firstBody.data.remaining;

      // Second redemption with same idempotency key
      const second = await app.inject({
        method: 'POST',
        url: `/entitlements/${entitlementId}/redeem`,
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: {
          quantity: 1,
          idempotency_key: idempotencyKey,
        },
      });
      expect(second.statusCode).toBe(200);
      const secondBody = JSON.parse(second.payload);
      expect(secondBody.data.success).toBe(true);
      expect(secondBody.data.redemption_id).toBe(firstBody.data.redemption_id);

      // Verify the DB quantity did NOT decrease again
      const dbEntitlement = await db('entitlements').where({ id: entitlementId }).first();
      expect(Number(dbEntitlement.quantity_remaining)).toBe(remainingAfterFirst);
    });

    it('verifies redemption_records table has the entry', async () => {
      const records = await db('redemption_records')
        .where({ entitlement_id: entitlementId, result_status: 'success' });
      expect(records.length).toBeGreaterThan(0);
      expect(records[0].user_id).toBe(plannerUserId);
      expect(Number(records[0].quantity)).toBeGreaterThan(0);
    });

    it('rejects redemption when requested quantity exceeds remaining', async () => {
      // Try to redeem more than what is left
      const dbEntitlement = await db('entitlements').where({ id: entitlementId }).first();
      const remaining = Number(dbEntitlement.quantity_remaining);
      const excessiveQuantity = remaining + 100;

      const res = await app.inject({
        method: 'POST',
        url: `/entitlements/${entitlementId}/redeem`,
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: {
          quantity: excessiveQuantity,
          idempotency_key: randomUUID(),
        },
      });

      expect(res.statusCode).toBe(422);
      const body = JSON.parse(res.payload);
      expect(body.data.success).toBe(false);
      expect(body.data.failure_reason).toMatch(/[Ii]nsufficient/);

      // Verify DB quantity did not change
      const dbAfter = await db('entitlements').where({ id: entitlementId }).first();
      expect(Number(dbAfter.quantity_remaining)).toBe(remaining);
    });

    it('returns a clean 404 when redeeming a nonexistent entitlement (no FK violation)', async () => {
      // Regression guard for the entitlement-not-found FK failure. The
      // redeem service previously tried to insert a redemption_records row
      // with a zero-UUID event_id placeholder, which blew up on the FK to
      // events. The route must now surface a stable 404 with a structured
      // error body and never persist any record.
      const unknownId = randomUUID();
      const beforeCount = Number(
        (
          await db('redemption_records')
            .where({ entitlement_id: unknownId })
            .count('id as c')
            .first()
        ).c,
      );

      const res = await app.inject({
        method: 'POST',
        url: `/entitlements/${unknownId}/redeem`,
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: {
          quantity: 1,
          idempotency_key: randomUUID(),
        },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.code).toBeDefined();
      expect(typeof body.message).toBe('string');
      expect(body.message.length).toBeGreaterThan(0);
      expect(body.requestId).toBeDefined();
      // No leaked FK-violation wording should surface in the response body.
      expect(body.message).not.toMatch(/foreign key|FK|violates/i);

      // No redemption_records row should have been inserted.
      const afterCount = Number(
        (
          await db('redemption_records')
            .where({ entitlement_id: unknownId })
            .count('id as c')
            .first()
        ).c,
      );
      expect(afterCount).toBe(beforeCount);
    });
  });

  // -------------------------------------------------------------------------
  // Expired entitlement redemption
  // -------------------------------------------------------------------------
  describe('Expired entitlement redemption', () => {
    it('rejects redemption of an expired entitlement', async () => {
      // Issue an entitlement that is already expired (expires_at in the past)
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      const res = await app.inject({
        method: 'POST',
        url: '/entitlements/issue-manual',
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: {
          event_id: eventId,
          user_id: plannerUserId,
          entitlement_type_id: entitlementTypeId,
          quantity_total: 10,
          expires_at: pastDate.toISOString(),
        },
      });

      expect(res.statusCode).toBe(201);
      const expiredId = JSON.parse(res.payload).data.id;

      // Try to redeem the expired entitlement
      const redeemRes = await app.inject({
        method: 'POST',
        url: `/entitlements/${expiredId}/redeem`,
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: {
          quantity: 1,
          idempotency_key: randomUUID(),
        },
      });

      expect(redeemRes.statusCode).toBe(422);
      const body = JSON.parse(redeemRes.payload);
      expect(body.data.success).toBe(false);
      expect(body.data.failure_reason).toMatch(/[Ee]xpir/);
    });
  });
});
