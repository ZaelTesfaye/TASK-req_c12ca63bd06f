/**
 * Backup Service
 *
 * Business logic for database backups (pg_dump stub), backup run tracking,
 * and restore drill management.
 */

import { randomUUID } from 'node:crypto';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import db from '../../db/connection.js';
import config from '../../config/index.js';
import { createLogger } from '../../logging/index.js';
import { writeAudit } from '../../shared/audit.js';

const execAsync = promisify(exec);
const log = createLogger('backup:service');

/**
 * Execute a database backup using pg_dump.
 * In containerized environments, pg_dump is expected to be available.
 * Records the run in backup_runs table.
 *
 * @returns {Promise<object>} The backup run record
 */
export async function runBackup() {
  log.info({ action: 'runBackup' }, 'Starting database backup');

  const startedAt = new Date();
  const backupId = randomUUID();
  const timestamp = startedAt.toISOString().replace(/[:.]/g, '-');
  const filename = `backup_${timestamp}.sql.gz`;
  const year = String(startedAt.getFullYear());
  const month = String(startedAt.getMonth() + 1).padStart(2, '0');
  const relativeDir = join(year, month);
  const absoluteDir = join(config.backup.root, relativeDir);
  const absolutePath = join(absoluteDir, filename);
  const relativePath = join(relativeDir, filename);

  // Insert an in-progress record
  const [run] = await db('backup_runs')
    .insert({
      id: backupId,
      started_at: startedAt,
      status: 'running',
      artifact_path: relativePath,
      notes: null,
    })
    .returning('*');

  try {
    // Ensure backup directory exists
    await mkdir(absoluteDir, { recursive: true });

    // Run pg_dump (stub: will fail gracefully in non-Docker environments)
    const databaseUrl = config.databaseUrl;
    const cmd = `pg_dump "${databaseUrl}" | gzip > "${absolutePath}"`;

    await execAsync(cmd, { timeout: 300_000 }); // 5 min timeout

    const endedAt = new Date();

    // Update the run record
    const [completed] = await db('backup_runs')
      .where({ id: backupId })
      .update({
        ended_at: endedAt,
        status: 'completed',
      })
      .returning('*');

    log.info(
      { action: 'runBackup', backupId, durationMs: endedAt - startedAt },
      'Database backup completed',
    );

    return completed;
  } catch (err) {
    const endedAt = new Date();

    // Record failure
    const [failed] = await db('backup_runs')
      .where({ id: backupId })
      .update({
        ended_at: endedAt,
        status: 'failed',
        notes: err.message,
      })
      .returning('*');

    log.error(
      { action: 'runBackup', backupId, err: err.message },
      'Database backup failed',
    );

    return failed;
  }
}

/**
 * List backup run records.
 *
 * @param {object} [opts]
 * @param {number} [opts.limit=50]
 * @returns {Promise<object[]>}
 */
export async function getBackupRuns(opts = {}) {
  const limit = opts.limit || 50;

  log.debug({ action: 'getBackupRuns', limit }, 'Listing backup runs');

  return db('backup_runs')
    .select('*')
    .orderBy('started_at', 'desc')
    .limit(limit);
}

/**
 * Record a restore test drill.
 *
 * @param {object} data
 * @param {string} data.backup_run_id - Reference to the backup being tested
 * @param {string} data.drill_quarter - e.g. '2026-Q1'
 * @param {string} [data.restored_db_name]
 * @param {object} [data.verification_json]
 * @param {string} [data.notes]
 * @param {string} data.executed_by - User UUID performing the drill
 * @returns {Promise<object>} The drill run record
 */
export async function recordDrill(data) {
  log.info(
    { action: 'recordDrill', backupRunId: data.backup_run_id, quarter: data.drill_quarter },
    'Recording restore test drill',
  );

  const now = new Date();

  const [drill] = await db('drill_runs')
    .insert({
      backup_run_id: data.backup_run_id,
      drill_quarter: data.drill_quarter,
      started_at: data.started_at || now,
      ended_at: data.ended_at || now,
      status: data.status || 'completed',
      restored_db_name: data.restored_db_name || null,
      verification_json: data.verification_json
        ? JSON.stringify(data.verification_json)
        : null,
      executed_by: data.executed_by,
      notes: data.notes || null,
    })
    .returning('*');

  // Mark the backup run as restore-tested
  await db('backup_runs')
    .where({ id: data.backup_run_id })
    .update({ restore_tested: true });

  // Write audit trail
  await writeAudit({
    eventId: null,
    subjectType: 'drill_run',
    subjectId: drill.id,
    action: 'record_drill',
    actorUserId: data.executed_by,
    before: null,
    after: {
      backup_run_id: data.backup_run_id,
      drill_quarter: data.drill_quarter,
      status: drill.status,
    },
    notes: `Restore drill recorded for quarter ${data.drill_quarter}`,
  });

  log.info(
    { action: 'recordDrill', drillId: drill.id },
    'Restore drill recorded',
  );

  return drill;
}

/**
 * List restore test (drill) runs.
 *
 * @param {object} [opts]
 * @param {number} [opts.limit=50]
 * @returns {Promise<object[]>}
 */
export async function getRestoreTestStatus(opts = {}) {
  const limit = opts.limit || 50;

  log.debug({ action: 'getRestoreTestStatus', limit }, 'Listing drill runs');

  return db('drill_runs')
    .select(
      'drill_runs.*',
      'backup_runs.started_at as backup_started_at',
      'backup_runs.status as backup_status',
      'backup_runs.artifact_path as backup_artifact_path',
    )
    .leftJoin('backup_runs', 'backup_runs.id', 'drill_runs.backup_run_id')
    .orderBy('drill_runs.started_at', 'desc')
    .limit(limit);
}
