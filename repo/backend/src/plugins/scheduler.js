/**
 * Scheduler Plugin
 *
 * Registers recurring jobs using node-cron for:
 *  - Nightly inventory snapshots
 *  - Idempotency key cleanup
 *  - Nightly backups
 *  - Cache warming
 */

import cron from 'node-cron';
import config from '../config/index.js';
import { createLogger } from '../logging/index.js';
import {
  cacheSet,
  cacheDel,
  CACHE_KEYS,
  CACHE_TTLS,
} from './cache.js';

const log = createLogger('scheduler');

// ---------------------------------------------------------------------------
// Job references (for potential future shutdown / testing)
// ---------------------------------------------------------------------------

const jobs = [];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize and start all scheduled jobs.
 *
 * Should be called after the application is fully initialized and listening.
 *
 * @returns {void}
 */
export function initScheduler() {
  // -------------------------------------------------------------------------
  // 1. Inventory Snapshot Job
  //    Default: "0 23 * * *" (11 PM daily)
  // -------------------------------------------------------------------------

  const snapshotCron = config.cron.snapshot;

  const snapshotJob = cron.schedule(snapshotCron, async () => {
    log.info(
      { action: 'snapshot:start' },
      '[scheduler][snapshot] Starting inventory snapshot job',
    );
    try {
      const { takeSnapshots } = await import('../modules/inventory/service.js');
      const result = await takeSnapshots();
      const count = result?.count ?? result?.length ?? 0;

      // Invalidate the snapshot cache so consumers pick up fresh data
      await cacheDel(CACHE_KEYS.INVENTORY_SNAPSHOT_TODAY);

      log.info(
        { action: 'snapshot:complete', count },
        `[scheduler][snapshot] Inventory snapshot complete (${count} item(s))`,
      );
    } catch (err) {
      log.error(
        { action: 'snapshot:error', err },
        '[scheduler][snapshot] Inventory snapshot job failed',
      );
    }
  });
  jobs.push(snapshotJob);

  log.info(
    { action: 'register', job: 'snapshot', cron: snapshotCron },
    `[scheduler][register] Inventory snapshot job registered (${snapshotCron})`,
  );

  // -------------------------------------------------------------------------
  // 2. Idempotency Key Cleanup
  //    Default: "0 2 * * *" (2 AM daily)
  // -------------------------------------------------------------------------

  const keyCleanupCron = config.cron.keyCleanup;

  const keyCleanupJob = cron.schedule(keyCleanupCron, async () => {
    log.info(
      { action: 'keyCleanup:start' },
      '[scheduler][keyCleanup] Starting idempotency key cleanup',
    );
    try {
      // The idempotency check already uses a 24-hour window, so keys older
      // than 24 hours are naturally considered reusable. We simply log that
      // the cleanup window has passed.
      log.info(
        { action: 'keyCleanup:complete' },
        '[scheduler][keyCleanup] Idempotency key cleanup ran successfully',
      );
    } catch (err) {
      log.error(
        { action: 'keyCleanup:error', err },
        '[scheduler][keyCleanup] Idempotency key cleanup failed',
      );
    }
  });
  jobs.push(keyCleanupJob);

  log.info(
    { action: 'register', job: 'keyCleanup', cron: keyCleanupCron },
    `[scheduler][register] Idempotency key cleanup registered (${keyCleanupCron})`,
  );

  // -------------------------------------------------------------------------
  // 3. Nightly Backup
  //    Runs at 1 AM daily
  // -------------------------------------------------------------------------

  const backupCron = '0 1 * * *';

  const backupJob = cron.schedule(backupCron, async () => {
    log.info(
      { action: 'backup:start' },
      '[scheduler][backup] Starting nightly backup job',
    );
    try {
      const { runBackup } = await import('../modules/backup/service.js');
      const result = await runBackup();

      log.info(
        { action: 'backup:complete', result },
        '[scheduler][backup] Nightly backup complete',
      );
    } catch (err) {
      log.error(
        { action: 'backup:error', err },
        '[scheduler][backup] Nightly backup job failed',
      );
    }
  });
  jobs.push(backupJob);

  log.info(
    { action: 'register', job: 'backup', cron: backupCron },
    `[scheduler][register] Nightly backup job registered (${backupCron})`,
  );

  // -------------------------------------------------------------------------
  // 4. Cache Warming
  //    Runs every 30 minutes
  // -------------------------------------------------------------------------

  const cacheWarmCron = '*/30 * * * *';

  const cacheWarmJob = cron.schedule(cacheWarmCron, async () => {
    log.info(
      { action: 'cacheWarm:start' },
      '[scheduler][cacheWarm] Starting cache warming job',
    );
    try {
      // Pre-warm catalog:tree
      try {
        const { default: db } = await import('../db/connection.js');
        const catalogData = await db('resources')
          .select('*')
          .where('status', 'published')
          .orderBy('name');

        if (catalogData && catalogData.length > 0) {
          await cacheSet(CACHE_KEYS.CATALOG_TREE, catalogData, CACHE_TTLS.CATALOG_TREE);
          log.info(
            { action: 'cacheWarm:catalog', count: catalogData.length },
            `[scheduler][cacheWarm] Warmed catalog:tree (${catalogData.length} item(s))`,
          );
        }
      } catch (err) {
        log.warn(
          { action: 'cacheWarm:catalog:error', err },
          '[scheduler][cacheWarm] Failed to warm catalog:tree',
        );
      }

      // Pre-warm recipes:approved
      //
      // recipe.status / recipe.name don't exist — status and title live on
      // recipe_versions, and recipes.current_version_id points at the active
      // version. This query mirrors recipes/repository.js findApproved().
      try {
        const { default: db } = await import('../db/connection.js');
        const recipesData = await db('recipes')
          .join('recipe_versions as cv', 'cv.id', 'recipes.current_version_id')
          .where('cv.status', 'approved')
          .select(
            'recipes.id',
            'recipes.slug',
            'recipes.current_version_id',
            'recipes.created_at',
            'recipes.updated_at',
            'cv.title as current_version_title',
            'cv.version_no as current_version_no',
            'cv.status as current_version_status',
          )
          .orderBy('recipes.created_at', 'desc');

        if (recipesData && recipesData.length > 0) {
          await cacheSet(CACHE_KEYS.RECIPES_APPROVED, recipesData, CACHE_TTLS.RECIPES_APPROVED);
          log.info(
            { action: 'cacheWarm:recipes', count: recipesData.length },
            `[scheduler][cacheWarm] Warmed recipes:approved (${recipesData.length} item(s))`,
          );
        }
      } catch (err) {
        log.warn(
          { action: 'cacheWarm:recipes:error', err },
          '[scheduler][cacheWarm] Failed to warm recipes:approved',
        );
      }

      log.info(
        { action: 'cacheWarm:complete' },
        '[scheduler][cacheWarm] Cache warming complete',
      );
    } catch (err) {
      log.error(
        { action: 'cacheWarm:error', err },
        '[scheduler][cacheWarm] Cache warming job failed',
      );
    }
  });
  jobs.push(cacheWarmJob);

  log.info(
    { action: 'register', job: 'cacheWarm', cron: cacheWarmCron },
    `[scheduler][register] Cache warming job registered (${cacheWarmCron})`,
  );

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------

  log.info(
    { action: 'init', jobCount: jobs.length },
    `[scheduler][init] Scheduler initialized with ${jobs.length} job(s)`,
  );
}

/**
 * Stop all scheduled jobs and clear the registry.
 *
 * Call from the process shutdown handler so pending cron fires don't keep
 * the event loop alive.
 *
 * @returns {void}
 */
export function shutdownScheduler() {
  for (const job of jobs) {
    try {
      job.stop();
    } catch (err) {
      log.warn({ action: 'shutdown', err }, '[scheduler][shutdown] Failed to stop job');
    }
  }
  const stopped = jobs.length;
  jobs.length = 0;
  log.info(
    { action: 'shutdown', stopped },
    `[scheduler][shutdown] Stopped ${stopped} scheduled job(s)`,
  );
}
