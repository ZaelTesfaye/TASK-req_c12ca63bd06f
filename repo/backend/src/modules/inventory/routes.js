/**
 * Inventory Routes
 *
 * Fastify plugin that registers inventory-related endpoints under the /inventory prefix.
 * All routes require JWT authentication and appropriate permissions.
 */

import { z } from 'zod';
import { createLogger } from '../../logging/index.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateQuery, validateParams, validateBody } from '../../middleware/validate.js';
import { parsePagination, formatPaginatedResponse } from '../../shared/pagination.js';
import { NotFoundError } from '../../shared/errors.js';
import * as inventoryRepo from './repository.js';
import * as inventoryService from './service.js';

const log = createLogger('inventory:routes');

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const listItemsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  sortBy: z.enum(['name', 'kind', 'current_quantity', 'created_at', 'updated_at']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional().default('asc'),
  kind: z.enum(['ingredient', 'rental']).optional(),
  search: z.string().max(200).optional(),
});

const itemIdParamSchema = z.object({
  id: z.string().uuid(),
});

const snapshotsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  sortBy: z.enum(['snapshot_date', 'quantity', 'unit_price', 'recorded_at']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional().default('asc'),
  item_id: z.string().uuid().optional(),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const anomaliesQuerySchema = z.object({
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const gapsQuerySchema = z.object({
  item_id: z.string().uuid().optional(),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const resolveGapParamSchema = z.object({
  item_id: z.string().uuid(),
});

const resolveGapBodySchema = z.object({
  missing_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().min(1).max(2000),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {object} _opts
 */
async function inventoryRoutes(fastify, _opts) {

  // -------------------------------------------------------------------------
  // GET /inventory/items - List inventory items (paginated)
  // -------------------------------------------------------------------------
  fastify.get(
    '/inventory/items',
    {
      preHandler: [
        authenticate,
        authorize('inventory:read'),
        validateQuery(listItemsQuerySchema),
      ],
    },
    async (request, reply) => {
      const pagination = parsePagination(request.query);
      const filters = {
        ...pagination,
        kind: request.query.kind,
        search: request.query.search,
      };

      const { data, total } = await inventoryRepo.findAllItems(filters);

      log.info(
        { action: 'listItems', page: pagination.page, total },
        'Listed inventory items',
      );

      return reply.status(200).send(formatPaginatedResponse(data, total, pagination));
    },
  );

  // -------------------------------------------------------------------------
  // GET /inventory/items/:id - Get single inventory item
  // -------------------------------------------------------------------------
  fastify.get(
    '/inventory/items/:id',
    {
      preHandler: [
        authenticate,
        authorize('inventory:read'),
        validateParams(itemIdParamSchema),
      ],
    },
    async (request, reply) => {
      const { id } = request.params;
      const item = await inventoryRepo.findItemById(id);

      if (!item) {
        throw new NotFoundError('InventoryItem', id);
      }

      log.info({ action: 'getItem', itemId: id }, 'Retrieved inventory item');

      return reply.status(200).send({ data: item });
    },
  );

  // -------------------------------------------------------------------------
  // GET /inventory/snapshots - List snapshots (paginated)
  // -------------------------------------------------------------------------
  fastify.get(
    '/inventory/snapshots',
    {
      preHandler: [
        authenticate,
        authorize('inventory:read'),
        validateQuery(snapshotsQuerySchema),
      ],
    },
    async (request, reply) => {
      const pagination = parsePagination(request.query);
      const filters = {
        ...pagination,
        item_id: request.query.item_id,
        from_date: request.query.from_date,
        to_date: request.query.to_date,
      };

      const { data, total } = await inventoryRepo.getAllSnapshots(filters);

      log.info(
        { action: 'listSnapshots', page: pagination.page, total },
        'Listed inventory snapshots',
      );

      return reply.status(200).send(formatPaginatedResponse(data, total, pagination));
    },
  );

  // -------------------------------------------------------------------------
  // GET /inventory/anomalies - Detect anomalies in date range
  // -------------------------------------------------------------------------
  fastify.get(
    '/inventory/anomalies',
    {
      preHandler: [
        authenticate,
        authorize('inventory:read'),
        validateQuery(anomaliesQuerySchema),
      ],
    },
    async (request, reply) => {
      const { from_date, to_date } = request.query;
      const anomalies = await inventoryService.detectAnomalies({
        from: from_date,
        to: to_date,
      });

      log.info(
        { action: 'anomalies', count: anomalies.length },
        'Retrieved inventory anomalies',
      );

      return reply.status(200).send({ data: anomalies });
    },
  );

  // -------------------------------------------------------------------------
  // GET /inventory/gaps - Find unresolved gaps
  // -------------------------------------------------------------------------
  fastify.get(
    '/inventory/gaps',
    {
      preHandler: [
        authenticate,
        authorize('inventory:read'),
        validateQuery(gapsQuerySchema),
      ],
    },
    async (request, reply) => {
      const { item_id, from_date, to_date } = request.query;

      let gaps;
      if (item_id) {
        const missingDays = await inventoryService.detectGaps(item_id, from_date, to_date);
        gaps = missingDays.map((date) => ({ item_id, missing_date: date }));
      } else {
        gaps = await inventoryRepo.getUnresolvedGaps({ from: from_date, to: to_date });
      }

      log.info(
        { action: 'gaps', count: gaps.length },
        'Retrieved inventory gaps',
      );

      return reply.status(200).send({ data: gaps });
    },
  );

  // -------------------------------------------------------------------------
  // POST /inventory/gaps/:item_id/resolve - Resolve a gap
  //
  // The inventory item is identified by the URL path (:item_id) only.
  // The request body carries the missing date and resolution notes.
  // -------------------------------------------------------------------------
  fastify.post(
    '/inventory/gaps/:item_id/resolve',
    {
      preHandler: [
        authenticate,
        authorize('inventory:resolve_gap'),
        validateParams(resolveGapParamSchema),
        validateBody(resolveGapBodySchema),
      ],
    },
    async (request, reply) => {
      const { item_id } = request.params;
      const { missing_date, notes } = request.body;

      const resolution = await inventoryService.resolveGap(
        request.user.userId,
        { item_id, missing_date },
        notes,
      );

      log.info(
        { action: 'resolveGap', resolutionId: resolution.id },
        'Inventory gap resolved',
      );

      return reply.status(201).send({ data: resolution });
    },
  );
}

export default inventoryRoutes;
