/**
 * api/helpers.js — authentication helpers for no-mock HTTP tests.
 *
 * Replaces the legacy `TEST_TOKENS` mock-token table with real JWT access
 * tokens produced by POST /auth/login. Callers should first `await` an app
 * from `getApp()` (see `./setup.js`), then use `authHeader(app, 'admin')`.
 */

import { loginAs } from './setup.js';

// Seeded demo users (see `backend/src/db/seeds/002_demo_users.js`). Passwords
// come from the same seed and are only valid when NODE_ENV !== 'production'.
const SEED_CREDENTIALS = {
  admin: { username: 'admin', password: 'admin123!' },
  planner: { username: 'planner', password: 'planner123!' },
  manager: { username: 'manager', password: 'manager123!' },
  chef: { username: 'chef', password: 'chef123!' },
  editor: { username: 'chef', password: 'chef123!' },
  analyst: { username: 'analyst', password: 'analyst123!' },
  approver: { username: 'approver', password: 'approver123!' },
};

/**
 * Build a `{ Authorization: Bearer ... }` header for the given seeded role by
 * logging in through the real /auth/login endpoint.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {keyof typeof SEED_CREDENTIALS} [role='admin']
 * @returns {Promise<{ Authorization: string }>}
 */
export async function authHeader(app, role = 'admin') {
  const creds = SEED_CREDENTIALS[role];
  if (!creds) {
    throw new Error(`Unknown seeded role '${role}'; known roles: ${Object.keys(SEED_CREDENTIALS).join(', ')}`);
  }
  const token = await loginAs(app, creds.username, creds.password);
  return { Authorization: `Bearer ${token}` };
}
