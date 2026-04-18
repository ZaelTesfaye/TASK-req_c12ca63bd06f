/**
 * Admin Cache Management Routes
 *
 * Fastify plugin that registers admin-level cache management endpoints.
 * Requires the `ops:cache_admin` permission.
 */

import { createLogger } from '../logging/index.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { cacheDel, cachePurge, getCacheStats } from '../plugins/cache.js';
import { writeAudit } from '../shared/audit.js';

const log = createLogger('admin:cache');

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {object} _opts
 */
async function adminCacheRoutes(fastify, _opts) {

  // -------------------------------------------------------------------------
  // POST /admin/cache/purge - Purge cache (specific key or all)
  // -------------------------------------------------------------------------
  fastify.post(
    '/admin/cache/purge',
    {
      preHandler: [
        authenticate,
        authorize('ops:cache_admin'),
      ],
    },
    async (request, reply) => {
      const { key } = request.body || {};

      if (key) {
        await cacheDel(key);
        log.info(
          { action: 'purgeKey', key, userId: request.user.userId },
          `[admin:cache][purgeKey] Cache key "${key}" purged by ${request.user.username}`,
        );
      } else {
        await cachePurge();
        log.info(
          { action: 'purgeAll', userId: request.user.userId },
          `[admin:cache][purgeAll] Entire cache purged by ${request.user.username}`,
        );
      }

      // Write audit trail
      try {
        await writeAudit({
          eventId: null,
          subjectType: 'cache',
          subjectId: key || 'all',
          action: 'purge',
          actorUserId: request.user.userId,
          after: { key: key || 'all' },
          notes: key
            ? `Cache key "${key}" purged`
            : 'Entire cache purged',
        });
      } catch (err) {
        // Audit failure should not block the response
        log.error(
          { action: 'auditError', err },
          '[admin:cache][auditError] Failed to write audit entry for cache purge',
        );
      }

      return reply.status(200).send({ purged: true });
    },
  );

  // -------------------------------------------------------------------------
  // GET /admin/cache/stats - Cache hit/miss statistics
  // -------------------------------------------------------------------------
  fastify.get(
    '/admin/cache/stats',
    {
      preHandler: [
        authenticate,
        authorize('ops:cache_admin'),
      ],
    },
    async (request, reply) => {
      const stats = getCacheStats();

      log.info(
        { action: 'stats', userId: request.user.userId },
        '[admin:cache][stats] Cache stats requested',
      );

      return reply.status(200).send(stats);
    },
  );
}

export default adminCacheRoutes;
