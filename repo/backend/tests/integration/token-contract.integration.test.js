/**
 * Token Contract Integration Tests
 *
 * Cross-tier contract test that calls the real login endpoint and asserts
 * the response shape matches what the frontend expects. This test runs
 * against real Postgres (no mocks).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, getApp } from './setup.js';
import db from '../../src/db/connection.js';

let app;

beforeAll(async () => {
  await setupTestDb();
  app = await getApp();
}, 30000);

afterAll(async () => {
  if (app) await app.close();
  await teardownTestDb();
}, 30000);

describe('Auth token contract (real DB)', () => {
  it('POST /auth/login returns accessToken and refreshToken fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'admin', password: 'admin123!' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);

    // These are the EXACT field names the frontend expects
    expect(body).toHaveProperty('accessToken');
    expect(body).toHaveProperty('refreshToken');
    expect(body).toHaveProperty('expiresIn');
    expect(body).toHaveProperty('user');
    expect(body.user).toHaveProperty('id');
    expect(body.user).toHaveProperty('username');
    expect(body.user).toHaveProperty('roles');
    expect(body.user).toHaveProperty('permissions');

    // accessToken should be a JWT (3 dot-separated segments)
    expect(body.accessToken.split('.').length).toBe(3);

    // refreshToken should be a UUID
    expect(body.refreshToken).toMatch(/^[0-9a-f]{8}-/);
  });

  it('POST /auth/refresh returns accessToken and refreshToken fields', async () => {
    // First login to get a refresh token
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'admin', password: 'admin123!' },
    });
    const loginBody = JSON.parse(loginRes.payload);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: loginBody.refreshToken },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);

    expect(body).toHaveProperty('accessToken');
    expect(body).toHaveProperty('refreshToken');
    expect(body).toHaveProperty('expiresIn');
    expect(body.accessToken.split('.').length).toBe(3);
  });

  it('accessToken is accepted as Bearer token on protected routes', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'admin', password: 'admin123!' },
    });
    const { accessToken } = JSON.parse(loginRes.payload);

    const meRes = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(meRes.statusCode).toBe(200);
    const meBody = JSON.parse(meRes.payload);
    expect(meBody).toHaveProperty('id');
    expect(meBody).toHaveProperty('username');
  });

  it('login response user.roles is an array of strings', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'planner', password: 'planner123!' },
    });
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.user.roles)).toBe(true);
    expect(body.user.roles.length).toBeGreaterThan(0);
    expect(typeof body.user.roles[0]).toBe('string');
  });

  it('login response user.permissions is an array of strings', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'planner', password: 'planner123!' },
    });
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.user.permissions)).toBe(true);
    expect(body.user.permissions.length).toBeGreaterThan(0);
    expect(typeof body.user.permissions[0]).toBe('string');
  });

  it('expiresIn is a positive number (seconds)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'admin', password: 'admin123!' },
    });
    const body = JSON.parse(res.payload);
    expect(typeof body.expiresIn).toBe('number');
    expect(body.expiresIn).toBeGreaterThan(0);
  });

  it('refresh response does NOT include a user object (only tokens)', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'admin', password: 'admin123!' },
    });
    const loginBody = JSON.parse(loginRes.payload);

    const refreshRes = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: loginBody.refreshToken },
    });
    const refreshBody = JSON.parse(refreshRes.payload);

    // Refresh endpoint returns tokens only, not user data
    expect(refreshBody).toHaveProperty('accessToken');
    expect(refreshBody).toHaveProperty('refreshToken');
    expect(refreshBody).toHaveProperty('expiresIn');
    expect(refreshBody).not.toHaveProperty('user');
  });

  it('invalid refresh token returns 401 with UNAUTHORIZED code', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: '00000000-0000-0000-0000-000000000000' },
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('UNAUTHORIZED');
  });
});
