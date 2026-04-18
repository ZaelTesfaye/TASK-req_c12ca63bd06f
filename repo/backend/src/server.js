/**
 * Server Entry Point
 *
 * Runs database migrations, initializes cache and scheduler, builds the
 * Fastify app, and starts listening. Registers graceful-shutdown hooks so
 * cache connections and cron jobs are torn down cleanly on SIGTERM/SIGINT.
 */

import { buildApp } from './app.js';
import config from './config/index.js';
import { runMigrations } from './db/connection.js';
import { createLogger } from './logging/index.js';
import { initCache, shutdownCache } from './plugins/cache.js';
import { initScheduler, shutdownScheduler } from './plugins/scheduler.js';

const log = createLogger('server');

async function start() {
  try {
    // Run pending database migrations before accepting traffic
    await runMigrations();

    // Initialize cache provider (redis or in-memory)
    try {
      await initCache();
    } catch (err) {
      log.fatal(
        { action: 'initCache', err },
        '[server][initCache] Cache initialization failed'
      );
      throw err;
    }

    // Build the Fastify application
    const app = await buildApp();

    // Start listening
    await app.listen({ port: config.port, host: '0.0.0.0' });

    // Register scheduled jobs after the app is listening so jobs that depend
    // on application state can assume it is ready.
    try {
      initScheduler();
    } catch (err) {
      log.fatal(
        { action: 'initScheduler', err },
        '[server][initScheduler] Scheduler initialization failed'
      );
      throw err;
    }

    log.info(
      { action: 'start', port: config.port },
      `[server][start] Hospitality Ops API listening on port ${config.port}`
    );

    // Graceful shutdown — stop cron jobs, close HTTP connections, release cache.
    const shutdown = async (signal) => {
      log.info({ action: 'shutdown', signal }, `[server][shutdown] ${signal} received`);
      try {
        shutdownScheduler();
        await app.close();
        await shutdownCache();
      } catch (err) {
        log.error({ action: 'shutdown', err }, '[server][shutdown] Error during shutdown');
        process.exit(1);
      }
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    log.fatal(
      { action: 'start', err },
      '[server][start] Failed to start server'
    );
    process.exit(1);
  }
}

start();
