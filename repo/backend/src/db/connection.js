/**
 * Database Connection
 *
 * Creates and exports the singleton knex instance.
 * Provides helpers for running migrations and checking DB health.
 */

import knexLib from 'knex';
import knexConfig from './knexfile.js';
import { createLogger } from '../logging/index.js';

const log = createLogger('db');

// ---------------------------------------------------------------------------
// Singleton knex instance
// ---------------------------------------------------------------------------

const db = knexLib(knexConfig);

// ---------------------------------------------------------------------------
// Migration runner
// ---------------------------------------------------------------------------

/**
 * Run all pending migrations.
 * @returns {Promise<[number, string[]]>} Tuple of [batchNumber, migrationNames]
 */
export async function runMigrations() {
  log.info({ action: 'migrate' }, 'Running database migrations');
  try {
    const [batchNo, migrations] = await db.migrate.latest();
    if (migrations.length === 0) {
      log.info({ action: 'migrate' }, 'Database is already up to date');
    } else {
      log.info(
        { action: 'migrate', batch: batchNo, count: migrations.length },
        `Applied ${migrations.length} migration(s) in batch ${batchNo}`
      );
    }
    return [batchNo, migrations];
  } catch (err) {
    log.error({ action: 'migrate', err }, 'Migration failed');
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

/**
 * Verify that the database connection is alive.
 * Executes a lightweight `SELECT 1` query.
 *
 * @returns {Promise<{ ok: boolean, latencyMs: number, error?: string }>}
 */
export async function checkDbHealth() {
  const start = Date.now();
  try {
    await db.raw('SELECT 1');
    const latencyMs = Date.now() - start;
    log.debug({ action: 'health', latencyMs }, 'Database health check passed');
    return { ok: true, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - start;
    log.error({ action: 'health', err, latencyMs }, 'Database health check failed');
    return { ok: false, latencyMs, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Graceful shutdown helper
// ---------------------------------------------------------------------------

/**
 * Destroy the connection pool. Call during graceful shutdown.
 */
export async function destroyConnection() {
  log.info({ action: 'shutdown' }, 'Closing database connection pool');
  await db.destroy();
}

export default db;
export { db };
