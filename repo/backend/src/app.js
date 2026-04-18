/**
 * Fastify Application Factory
 *
 * Builds and configures the Fastify instance with all plugins, hooks,
 * and error handling for the Hospitality Operations Management System.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import cookie from '@fastify/cookie';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import config from './config/index.js';
import db from './db/connection.js';
import { createLogger } from './logging/index.js';
import { AppError } from './shared/errors.js';

// Resolve package.json once at module load so /health can surface the
// backend's deployed version without re-reading on every request.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
let APP_VERSION = 'unknown';
try {
  const pkg = JSON.parse(
    readFileSync(resolve(__dirname, '..', 'package.json'), 'utf8'),
  );
  APP_VERSION = pkg.version || 'unknown';
} catch {
  // Leave APP_VERSION at 'unknown' if the file can't be read; /health still works.
}

const log = createLogger('http');

/**
 * Build and return a fully configured Fastify instance.
 *
 * @returns {Promise<import('fastify').FastifyInstance>}
 */
export async function buildApp() {
  const app = Fastify({
    logger: false, // We use our own pino-based logger
  });

  // ---------------------------------------------------------------------------
  // Plugins
  // ---------------------------------------------------------------------------

  await app.register(cors, {
    origin: config.frontendUrl,
    credentials: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: config.isProduction ? undefined : false,
  });

  await app.register(multipart, {
    limits: {
      fileSize: config.upload.maxMb * 1024 * 1024,
    },
  });

  await app.register(cookie);

  // ---------------------------------------------------------------------------
  // Decorators
  // ---------------------------------------------------------------------------

  app.decorateRequest('requestId', null);
  app.decorateRequest('user', null);

  // ---------------------------------------------------------------------------
  // Global Hooks
  // ---------------------------------------------------------------------------

  app.addHook('onRequest', async (request) => {
    request.requestId = request.id;
    log.info(
      { action: 'request', method: request.method, url: request.url },
      `[http][request] ${request.method} ${request.url}`
    );
  });

  app.addHook('onResponse', async (request, reply) => {
    log.info(
      {
        action: 'response',
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
      },
      `[http][response] ${request.method} ${request.url} ${reply.statusCode} ${reply.elapsedTime?.toFixed(1)}ms`
    );
  });

  // ---------------------------------------------------------------------------
  // Global Error Handler
  // ---------------------------------------------------------------------------

  app.setErrorHandler((error, request, reply) => {
    log.error(
      { action: 'error', err: error, requestId: request.id },
      `[http][error] ${error.message}`
    );

    // Structured AppError instances
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        code: error.code,
        message: error.message,
        details: error.details || null,
        requestId: request.id,
      });
    }

    // Fastify validation errors (from JSON Schema validation)
    if (error.validation) {
      return reply.status(422).send({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: { errors: error.validation },
        requestId: request.id,
      });
    }

    // Default: Internal Server Error
    const statusCode = error.statusCode || 500;
    return reply.status(statusCode).send({
      code: 'INTERNAL_ERROR',
      message: config.isProduction
        ? 'An unexpected error occurred'
        : error.message,
      details: config.isProduction ? null : { stack: error.stack },
      requestId: request.id,
    });
  });

  // ---------------------------------------------------------------------------
  // Process-Level Error Handlers
  // ---------------------------------------------------------------------------

  process.on('unhandledRejection', (reason) => {
    log.fatal(
      { action: 'unhandledRejection', err: reason },
      '[process] Unhandled promise rejection — shutting down'
    );
    process.exit(1);
  });

  process.on('uncaughtException', (error) => {
    log.fatal(
      { action: 'uncaughtException', err: error },
      '[process] Uncaught exception — shutting down'
    );
    process.exit(1);
  });

  // ---------------------------------------------------------------------------
  // Route Plugins
  // ---------------------------------------------------------------------------

  const authRoutes = (await import('./auth/routes.js')).default;
  const userRoutes = (await import('./modules/users/routes.js')).default;
  const roleRoutes = (await import('./modules/roles/routes.js')).default;
  const eventRoutes = (await import('./modules/events/routes.js')).default;
  const approvalRoutes = (await import('./modules/approvals/routes.js')).default;
  const resourceRoutes = (await import('./modules/resources/routes.js')).default;
  const reservationRoutes = (await import('./modules/reservations/routes.js')).default;
  const recipeRoutes = (await import('./modules/recipes/routes.js')).default;
  const entitlementRoutes = (await import('./modules/entitlements/routes.js')).default;
  const inventoryRoutes = (await import('./modules/inventory/routes.js')).default;
  const attachmentRoutes = (await import('./modules/attachments/routes.js')).default;
  const checkinRoutes = (await import('./modules/checkin/routes.js')).default;
  const reportRoutes = (await import('./modules/reports/routes.js')).default;
  const dataCollectionRoutes = (await import('./modules/data-collection/routes.js')).default;
  const backupRoutes = (await import('./modules/backup/routes.js')).default;
  const auditRoutes = (await import('./modules/audit/routes.js')).default;
  const adminCacheRoutes = (await import('./modules/admin-cache-routes.js')).default;

  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(roleRoutes);
  await app.register(eventRoutes);
  await app.register(approvalRoutes);
  await app.register(resourceRoutes);
  await app.register(reservationRoutes);
  await app.register(recipeRoutes);
  await app.register(entitlementRoutes);
  await app.register(inventoryRoutes);
  await app.register(attachmentRoutes);
  await app.register(checkinRoutes);
  await app.register(reportRoutes);
  await app.register(dataCollectionRoutes);
  await app.register(backupRoutes);
  await app.register(auditRoutes);
  await app.register(adminCacheRoutes);

  // ---------------------------------------------------------------------------
  // Health Check
  //
  // Reports process uptime, deployed version, and live DB connectivity
  // (a single SELECT 1 round-trip with a short timeout). When the DB is
  // unreachable the endpoint still returns 200 with status='degraded' so
  // the caller sees the diagnostic payload rather than a raw 500.
  // ---------------------------------------------------------------------------

  app.get('/health', async () => {
    const startedAt = Date.now();
    let database = { connected: false, latencyMs: null, error: null };

    try {
      const dbStart = Date.now();
      await db.raw('SELECT 1');
      database = {
        connected: true,
        latencyMs: Date.now() - dbStart,
        error: null,
      };
    } catch (err) {
      database = {
        connected: false,
        latencyMs: null,
        error: err.message || 'unknown',
      };
    }

    return {
      status: database.connected ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      version: APP_VERSION,
      environment: config.nodeEnv,
      database,
      responseTimeMs: Date.now() - startedAt,
    };
  });

  return app;
}

export default buildApp;
