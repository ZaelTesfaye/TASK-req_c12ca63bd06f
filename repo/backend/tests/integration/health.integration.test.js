/**
 * Health Endpoint Integration Test
 *
 * Smoke test for the unauthenticated health probe. We don't just check
 * the status code — we verify the full diagnostic envelope so regressions
 * in the uptime/version/db fields (used by external monitoring) fail here.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setupTestDb, teardownTestDb, getApp } from './setup.js';
import db from '../../src/db/connection.js';

let app;
let expectedVersion;

beforeAll(async () => {
  await setupTestDb();
  app = await getApp();

  // Mirror the lookup the app does at boot so the test pins to the real
  // package.json instead of hardcoding a string that drifts.
  try {
    const pkg = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    );
    expectedVersion = pkg.version;
  } catch {
    expectedVersion = undefined;
  }
}, 30000);

afterAll(async () => {
  if (app) await app.close();
  await teardownTestDb();
}, 30000);

describe('GET /health (real DB)', () => {
  it('returns 200 with the full diagnostic envelope', async () => {
    const before = Date.now();
    const res = await app.inject({ method: 'GET', url: '/health' });
    const wallTime = Date.now() - before;

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);

    const body = JSON.parse(res.payload);

    // Top-level shape
    expect(body.status).toBe('ok');
    expect(typeof body.timestamp).toBe('string');
    expect(new Date(body.timestamp).toString()).not.toBe('Invalid Date');

    // Uptime is the process uptime in seconds
    expect(typeof body.uptime).toBe('number');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(body.uptime)).toBe(true);

    // Version is surfaced from package.json (or a sentinel fallback)
    expect(typeof body.version).toBe('string');
    if (expectedVersion) {
      expect(body.version).toBe(expectedVersion);
    }

    // Environment is reported so monitoring can distinguish envs
    expect(typeof body.environment).toBe('string');
    expect(body.environment.length).toBeGreaterThan(0);

    // Database liveness must be surfaced as a structured object, not a boolean
    expect(body.database).toBeDefined();
    expect(body.database.connected).toBe(true);
    expect(typeof body.database.latencyMs).toBe('number');
    expect(body.database.latencyMs).toBeGreaterThanOrEqual(0);
    // Well under a second in normal conditions — this catches a runaway query.
    expect(body.database.latencyMs).toBeLessThan(5000);
    expect(body.database.error).toBeNull();

    // Response time sanity check: the handler itself must respond quickly.
    expect(typeof body.responseTimeMs).toBe('number');
    expect(body.responseTimeMs).toBeLessThan(5000);
    expect(wallTime).toBeLessThan(5000);
  });

  it('includes a DB latency measurement that actually reflects a round-trip', async () => {
    // Two consecutive calls: both should succeed and both should report
    // a numeric latencyMs. If the probe accidentally becomes a no-op
    // (e.g. someone replaces SELECT 1 with a constant) this test will
    // catch it because latencyMs of `0` on every call is suspicious —
    // we assert that the total probe path still takes measurable time.
    const r1 = JSON.parse(
      (await app.inject({ method: 'GET', url: '/health' })).payload,
    );
    const r2 = JSON.parse(
      (await app.inject({ method: 'GET', url: '/health' })).payload,
    );
    expect(r1.database.connected).toBe(true);
    expect(r2.database.connected).toBe(true);
    // At least one of the two should show non-zero latency against a real DB.
    const anyLatency = r1.database.latencyMs > 0 || r2.database.latencyMs > 0;
    expect(anyLatency).toBe(true);
  });

  it('serves /health without authentication', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {}, // no Authorization header on purpose
    });
    expect(res.statusCode).toBe(200);
  });
});
