/**
 * Error Envelope Integration Tests
 *
 * The existing authorization tests typically assert only the HTTP status
 * code on 401/403 paths, which means a handler returning the right status
 * with a malformed error body would pass silently. This suite exercises
 * representative negative-path endpoints and asserts the full envelope
 * shape: `{ code, message, details, requestId }`.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, getApp, loginAs } from './setup.js';
import db from '../../src/db/connection.js';

let app;
let chefToken;
let plannerToken;

function expectErrorEnvelope(body, expectedCode) {
  // The envelope shape is consistent across the app's error handler and
  // individual preHandlers. Every negative-path response should carry
  // code, message (string), details (null or object), requestId (string).
  expect(body).toBeDefined();
  expect(body.code).toBe(expectedCode);
  expect(typeof body.message).toBe('string');
  expect(body.message.length).toBeGreaterThan(0);
  expect('details' in body).toBe(true);
  if (body.details !== null) {
    expect(typeof body.details).toBe('object');
  }
  expect(typeof body.requestId).toBe('string');
  expect(body.requestId.length).toBeGreaterThan(0);
}

beforeAll(async () => {
  await setupTestDb();
  app = await getApp();
  chefToken = await loginAs(app, 'chef', 'chef123!');
  plannerToken = await loginAs(app, 'planner', 'planner123!');
}, 30000);

afterAll(async () => {
  if (app) await app.close();
  await teardownTestDb();
}, 30000);

describe('401 UNAUTHORIZED envelope shape', () => {
  it('GET /events with no Authorization header returns the full envelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/events' });
    expect(res.statusCode).toBe(401);
    expectErrorEnvelope(JSON.parse(res.payload), 'UNAUTHORIZED');
  });

  it('GET /events with a malformed Authorization header returns the full envelope', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/events',
      headers: { Authorization: 'NotBearer xxx' },
    });
    expect(res.statusCode).toBe(401);
    expectErrorEnvelope(JSON.parse(res.payload), 'UNAUTHORIZED');
  });

  it('GET /events with an invalid JWT signature returns the full envelope', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/events',
      headers: { Authorization: 'Bearer not.a.real.jwt' },
    });
    expect(res.statusCode).toBe(401);
    expectErrorEnvelope(JSON.parse(res.payload), 'UNAUTHORIZED');
  });
});

describe('403 FORBIDDEN envelope shape', () => {
  it('GET /events as a user without event:read returns the full envelope with required/actual details', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/events',
      headers: { Authorization: `Bearer ${chefToken}` },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expectErrorEnvelope(body, 'FORBIDDEN');
    expect(Array.isArray(body.details.required)).toBe(true);
    expect(body.details.required).toContain('event:read');
    expect(Array.isArray(body.details.actual)).toBe(true);
  });

  it('POST /catalog/resources as a user without resource:manage returns the full envelope', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/catalog/resources',
      headers: { Authorization: `Bearer ${plannerToken}` },
      payload: { name: 'Blocked', resource_type: 'equipment' },
    });
    expect(res.statusCode).toBe(403);
    expectErrorEnvelope(JSON.parse(res.payload), 'FORBIDDEN');
  });

  it('POST /admin/cache/purge as a non-admin returns the full envelope', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/cache/purge',
      headers: { Authorization: `Bearer ${plannerToken}` },
    });
    expect(res.statusCode).toBe(403);
    expectErrorEnvelope(JSON.parse(res.payload), 'FORBIDDEN');
  });
});

describe('422 VALIDATION_ERROR envelope shape', () => {
  it('POST /events with an empty body returns the validation envelope', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/events',
      headers: { Authorization: `Bearer ${plannerToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.payload);
    expectErrorEnvelope(body, 'VALIDATION_ERROR');
    expect(body.details).toBeDefined();
    expect(Array.isArray(body.details.errors)).toBe(true);
    expect(body.details.errors.length).toBeGreaterThan(0);
  });
});
