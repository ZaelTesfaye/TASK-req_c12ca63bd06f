/**
 * Backup Routes
 *
 * Fastify plugin that registers backup administration endpoints
 * under the /admin/backups prefix.
 */

import { z } from 'zod';
import { createLogger } from '../../logging/index.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateBody } from '../../middleware/validate.js';
import { NotFoundError } from '../../shared/errors.js';
import * as backupService from './service.js';

const log = createLogger('backup:routes');

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const restoreTestBodySchema = z.object({
  backup_run_id: z.string().uuid(),
  drill_quarter: z.string().min(1).max(10),
  restored_db_name: z.string().max(100).optional(),
  verification_json: z.record(z.unknown()).optional(),
  notes: z.string().max(2000).optional(),
  started_at: z.string().datetime().optional(),
  ended_at: z.string().datetime().optional(),
  status: z.enum(['completed', 'failed', 'in_progress']).optional(),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {object} _opts
 */
async function backupRoutes(fastify, _opts) {

  // -------------------------------------------------------------------------
  // GET /admin/backups/runs - List backup runs
  // -------------------------------------------------------------------------
  fastify.get(
    '/admin/backups/runs',
    {
      preHandler: [
        authenticate,
        authorize('ops:backup_admin'),
      ],
    },
    async (request, reply) => {
      const runs = await backupService.getBackupRuns();

      log.info(
        { action: 'listRuns', count: runs.length },
        'Listed backup runs',
      );

      return reply.status(200).send({ data: runs });
    },
  );

  // -------------------------------------------------------------------------
  // POST /admin/backups/restore-test - Record a restore test drill
  // -------------------------------------------------------------------------
  fastify.post(
    '/admin/backups/restore-test',
    {
      preHandler: [
        authenticate,
        authorize('ops:backup_admin'),
        validateBody(restoreTestBodySchema),
      ],
    },
    async (request, reply) => {
      const drillData = {
        ...request.body,
        executed_by: request.user.userId,
      };

      const drill = await backupService.recordDrill(drillData);

      log.info(
        { action: 'recordDrill', drillId: drill.id },
        'Restore test drill recorded',
      );

      return reply.status(201).send({ data: drill });
    },
  );

  // -------------------------------------------------------------------------
  // GET /admin/backups/drills - List restore test drills
  // -------------------------------------------------------------------------
  fastify.get(
    '/admin/backups/drills',
    {
      preHandler: [
        authenticate,
        authorize('ops:backup_admin'),
      ],
    },
    async (request, reply) => {
      const drills = await backupService.getRestoreTestStatus();

      log.info(
        { action: 'listDrills', count: drills.length },
        'Listed restore test drills',
      );

      return reply.status(200).send({ data: drills });
    },
  );
}

export default backupRoutes;
