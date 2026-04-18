/**
 * Reports Routes
 *
 * Fastify plugin that registers report export endpoints under the /reports prefix.
 * Supports CSV export for inventory, events, and approvals data.
 */

import { z } from 'zod';
import { createLogger } from '../../logging/index.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateQuery } from '../../middleware/validate.js';
import * as reportsService from './service.js';

const log = createLogger('reports:routes');

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const inventoryExportQuerySchema = z.object({
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  format: z.enum(['csv']).optional().default('csv'),
});

const eventsExportQuerySchema = z.object({
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  state: z.enum(['draft', 'submitted', 'approved', 'in_service', 'closed']).optional(),
});

const approvalsExportQuerySchema = z.object({
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  approval_type: z.enum([
    'budget_override',
    'budget_change',
    'special_resource',
    'quota_override',
    'overtime',
  ]).optional(),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {object} _opts
 */
async function reportsRoutes(fastify, _opts) {

  // -------------------------------------------------------------------------
  // GET /reports/inventory/export - Export inventory report as CSV
  // -------------------------------------------------------------------------
  fastify.get(
    '/reports/inventory/export',
    {
      preHandler: [
        authenticate,
        authorize('inventory:export'),
        validateQuery(inventoryExportQuerySchema),
      ],
    },
    async (request, reply) => {
      const { from_date, to_date, format } = request.query;

      const result = await reportsService.exportInventoryReport(
        request.user.userId,
        { from: from_date, to: to_date },
        format,
      );

      log.info(
        { action: 'exportInventory', recordId: result.record.id },
        'Inventory report exported',
      );

      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="inventory_${from_date}_${to_date}.csv"`)
        .send(result.csv);
    },
  );

  // -------------------------------------------------------------------------
  // GET /reports/events/export - Export events report as CSV
  // -------------------------------------------------------------------------
  fastify.get(
    '/reports/events/export',
    {
      preHandler: [
        authenticate,
        authorize('reports:export'),
        validateQuery(eventsExportQuerySchema),
      ],
    },
    async (request, reply) => {
      const { from_date, to_date, state } = request.query;

      const result = await reportsService.exportEventsReport(
        request.user.userId,
        { from_date, to_date, state },
      );

      log.info(
        { action: 'exportEvents', recordId: result.record.id },
        'Events report exported',
      );

      const dateSuffix = from_date && to_date
        ? `_${from_date}_${to_date}`
        : `_${new Date().toISOString().slice(0, 10)}`;

      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="events${dateSuffix}.csv"`)
        .send(result.csv);
    },
  );

  // -------------------------------------------------------------------------
  // GET /reports/approvals/export - Export approvals report as CSV
  // -------------------------------------------------------------------------
  fastify.get(
    '/reports/approvals/export',
    {
      preHandler: [
        authenticate,
        authorize('reports:export'),
        validateQuery(approvalsExportQuerySchema),
      ],
    },
    async (request, reply) => {
      const { from_date, to_date, status, approval_type } = request.query;

      const result = await reportsService.exportApprovalsReport(
        request.user.userId,
        { from_date, to_date, status, approval_type },
      );

      log.info(
        { action: 'exportApprovals', recordId: result.record.id },
        'Approvals report exported',
      );

      const dateSuffix = from_date && to_date
        ? `_${from_date}_${to_date}`
        : `_${new Date().toISOString().slice(0, 10)}`;

      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="approvals${dateSuffix}.csv"`)
        .send(result.csv);
    },
  );
}

export default reportsRoutes;
