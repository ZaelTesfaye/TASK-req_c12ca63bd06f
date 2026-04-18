/**
 * Data Collection Routes
 *
 * Fastify plugin that registers data-collection subsystem endpoints.
 * All routes require admin-level authorization.
 */

import { z } from 'zod';
import { createLogger } from '../../logging/index.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateParams, validateQuery } from '../../middleware/validate.js';
import { parsePagination, formatPaginatedResponse } from '../../shared/pagination.js';
import { NotFoundError } from '../../shared/errors.js';
import * as dataCollectionService from './service.js';

const log = createLogger('data-collection:routes');

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const jobIdParamSchema = z.object({
  id: z.string().uuid(),
});

const listJobsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: z.enum(['pending', 'running', 'completed', 'failed']).optional(),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {object} _opts
 */
async function dataCollectionRoutes(fastify, _opts) {

  // -------------------------------------------------------------------------
  // GET /data-collection/health - Subsystem health check
  // -------------------------------------------------------------------------
  fastify.get(
    '/data-collection/health',
    {
      preHandler: [
        authenticate,
        authorize('ops:data_collection_admin'),
      ],
    },
    async (request, reply) => {
      const health = await dataCollectionService.healthCheck();

      log.info({ action: 'health' }, 'Data collection health check requested');

      return reply.status(200).send({ data: health });
    },
  );

  // -------------------------------------------------------------------------
  // POST /data-collection/jobs/:id/requeue - Requeue a failed job
  // -------------------------------------------------------------------------
  fastify.post(
    '/data-collection/jobs/:id/requeue',
    {
      preHandler: [
        authenticate,
        authorize('ops:data_collection_admin'),
        validateParams(jobIdParamSchema),
      ],
    },
    async (request, reply) => {
      const { id: jobId } = request.params;

      const updated = await dataCollectionService.requeueJob(jobId, request.user.userId);

      if (!updated) {
        throw new NotFoundError('DataCollectionJob', jobId);
      }

      log.info(
        { action: 'requeue', jobId },
        'Data collection job requeued',
      );

      return reply.status(200).send({ data: updated });
    },
  );

  // -------------------------------------------------------------------------
  // GET /admin/data-collection/jobs - List jobs (paginated)
  // -------------------------------------------------------------------------
  fastify.get(
    '/admin/data-collection/jobs',
    {
      preHandler: [
        authenticate,
        authorize('ops:data_collection_admin'),
        validateQuery(listJobsQuerySchema),
      ],
    },
    async (request, reply) => {
      const pagination = parsePagination(request.query);
      const filters = {
        ...pagination,
        status: request.query.status,
      };

      const { data, total } = await dataCollectionService.listJobs(filters);

      log.info(
        { action: 'listJobs', page: pagination.page, total },
        'Listed data collection jobs',
      );

      return reply.status(200).send(formatPaginatedResponse(data, total, pagination));
    },
  );
}

export default dataCollectionRoutes;
