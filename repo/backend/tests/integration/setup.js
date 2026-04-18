/**
 * Integration Test Setup
 *
 * Provides helpers for real database integration tests.
 * NO vi.mock() calls — everything is real: real knex, real Fastify, real Postgres.
 *
 * These tests are designed to run inside Docker where DATABASE_URL points to
 * a real PostgreSQL instance.
 */

import { runMigrations } from '../../src/db/connection.js';
import db from '../../src/db/connection.js';
import { buildApp } from '../../src/app.js';

// ---------------------------------------------------------------------------
// Tables to truncate during teardown — ordered to respect FK constraints
// (children first, parents last).
// ---------------------------------------------------------------------------

const TABLES_TO_TRUNCATE = [
  'redemption_records',
  'entitlements',
  'entitlement_issuance_rules',
  'entitlement_types',
  'bulk_import_batches',
  'event_checkins',
  'policy_exceptions',
  'event_resource_requests',
  'event_materials',
  'event_service_windows',
  'event_budget_revisions',
  'reservations',
  'approvals',
  'attachments',
  'resource_training_links',
  'resource_tags',
  'resources',
  'metadata_templates',
  'recipe_versions',
  'recipes',
  'inventory_gap_resolutions',
  'inventory_snapshots',
  'inventory_items',
  'report_exports',
  'data_collection_jobs',
  'drill_runs',
  'backup_runs',
  'manager_event_scopes',
  'refresh_tokens',
  'user_roles',
  'role_permissions',
  'permissions',
  'roles',
  'events',
  'users',
];

/**
 * Run all pending migrations and then seed the database.
 * Call once in a top-level beforeAll.
 */
export async function setupTestDb() {
  await runMigrations();
  // Run seeds — uses the directory configured in knexfile
  await db.seed.run();
}

/**
 * Truncate all application tables (in reverse FK order).
 * Temporarily disables audit_trail triggers so the cleanup succeeds.
 * Call in afterAll or between test suites to reset state.
 */
export async function teardownTestDb() {
  // Disable audit_trail immutability triggers temporarily for cleanup
  await db.raw('ALTER TABLE audit_trail DISABLE TRIGGER ALL');

  // Truncate audit_trail first (it references events and users)
  try {
    await db.raw('TRUNCATE TABLE "audit_trail" CASCADE');
  } catch (_) {
    // table might not exist yet
  }

  for (const table of TABLES_TO_TRUNCATE) {
    try {
      await db.raw(`TRUNCATE TABLE "${table}" CASCADE`);
    } catch (_) {
      // table might not exist yet — ignore
    }
  }

  // Re-enable audit_trail triggers
  await db.raw('ALTER TABLE audit_trail ENABLE TRIGGER ALL');
}

/**
 * Build and ready a Fastify application instance.
 * The caller is responsible for calling app.close() when done.
 *
 * @returns {Promise<import('fastify').FastifyInstance>}
 */
export async function getApp() {
  const app = await buildApp();
  await app.ready();
  return app;
}

/**
 * Authenticate as a user via POST /auth/login and return the access token.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {string} username
 * @param {string} password
 * @returns {Promise<string>} JWT access token
 */
export async function loginAs(app, username, password) {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { username, password },
  });
  const body = JSON.parse(res.payload);
  return body.accessToken || body.token;
}

/**
 * Authenticate and return the full login response body.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {string} username
 * @param {string} password
 * @returns {Promise<object>} Full parsed login response
 */
export async function loginFull(app, username, password) {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { username, password },
  });
  return JSON.parse(res.payload);
}

export { db };
