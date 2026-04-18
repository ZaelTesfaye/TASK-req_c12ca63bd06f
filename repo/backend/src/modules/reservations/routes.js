/**
 * Reservations Routes
 *
 * Fastify plugin that registers reservation endpoints under the /reservations prefix.
 * Manages the full reservation lifecycle: request, approve, release, occupy,
 * return, cancel, reschedule, renew, and overtime approval.
 */

import { z } from 'zod';
import { createLogger } from '../../logging/index.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateBody, validateQuery, validateParams } from '../../middleware/validate.js';
import { parsePagination, formatPaginatedResponse } from '../../shared/pagination.js';
import { NotFoundError, ForbiddenError } from '../../shared/errors.js';
import db from '../../db/connection.js';
import * as reservationsRepo from './repository.js';
import * as reservationsService from './service.js';

const log = createLogger('reservations:routes');

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const idParamSchema = z.object({
  id: z.string().uuid(),
});

const createReservationBodySchema = z.object({
  event_id: z.string().uuid(),
  resource_id: z.string().uuid(),
  scheduled_start_at: z.string().datetime({ offset: true }),
  scheduled_end_at: z.string().datetime({ offset: true }),
});

const listReservationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  sortBy: z
    .enum(['status', 'scheduled_start_at', 'scheduled_end_at', 'created_at', 'updated_at'])
    .optional(),
  sortDir: z.enum(['asc', 'desc']).optional().default('asc'),
  status: z.string().optional(),
  event_id: z.string().uuid().optional(),
  resource_id: z.string().uuid().optional(),
});

const occupyBodySchema = z.object({
  occupancy_count: z.number().int().positive(),
});

const returnBodySchema = z.object({
  actual_end_at: z.string().datetime({ offset: true }),
  overtime_justification: z.string().max(2000).optional(),
});

const rescheduleBodySchema = z.object({
  scheduled_start_at: z.string().datetime({ offset: true }),
  scheduled_end_at: z.string().datetime({ offset: true }),
});

const renewBodySchema = z.object({
  new_end_at: z.string().datetime({ offset: true }),
});

const approveOvertimeBodySchema = z.object({
  justification: z.string().min(1).max(2000),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {object} _opts
 */
async function reservationsRoutes(fastify, _opts) {

  // -------------------------------------------------------------------------
  // POST /reservations - Request a new reservation
  // -------------------------------------------------------------------------
  fastify.post(
    '/reservations',
    {
      preHandler: [
        authenticate,
        authorize('reservation:request'),
        validateBody(createReservationBodySchema),
      ],
    },
    async (request, reply) => {
      const reservation = await reservationsService.createReservation(
        request.user.userId,
        request.body,
      );

      log.info(
        { action: 'create', reservationId: reservation.id },
        'Reservation created',
      );

      return reply.status(201).send({ data: reservation });
    },
  );

  // -------------------------------------------------------------------------
  // GET /reservations - Paginated list with filters
  // -------------------------------------------------------------------------
  fastify.get(
    '/reservations',
    {
      preHandler: [
        authenticate,
        authorize('reservation:read'),
        validateQuery(listReservationsQuerySchema),
      ],
    },
    async (request, reply) => {
      const pagination = parsePagination(request.query);

      // Non-admin callers are scoped in the DB query so pagination totals
      // reflect visible rows. Admins see everything unfiltered.
      const userRoles = request.user.roles || [];
      const isAdmin = userRoles.includes('admin');

      let scope;
      if (!isAdmin) {
        const scopes = await db('manager_event_scopes')
          .where({ user_id: request.user.userId })
          .select('event_id');
        scope = {
          userId: request.user.userId,
          scopedEventIds: scopes.map((s) => s.event_id),
        };
      }

      const filters = {
        ...pagination,
        status: request.query.status,
        event_id: request.query.event_id,
        resource_id: request.query.resource_id,
        scope,
      };

      const { data, total } = await reservationsRepo.findAll(filters);

      log.info(
        { action: 'list', page: pagination.page, total },
        'Listed reservations',
      );

      return reply.status(200).send(formatPaginatedResponse(data, total, pagination));
    },
  );

  // -------------------------------------------------------------------------
  // GET /reservations/:id - Get a single reservation
  // -------------------------------------------------------------------------
  fastify.get(
    '/reservations/:id',
    {
      preHandler: [
        authenticate,
        authorize('reservation:read'),
        validateParams(idParamSchema),
      ],
    },
    async (request, reply) => {
      const { id } = request.params;

      const reservation = await reservationsRepo.findById(id);
      if (!reservation) {
        throw new NotFoundError('Reservation', id);
      }

      // Scope check for non-admin users
      const userRoles = request.user.roles || [];
      const isAdmin = userRoles.includes('admin');

      if (!isAdmin) {
        const isCreator = reservation.created_by === request.user.userId;

        if (!isCreator) {
          const scope = await db('manager_event_scopes')
            .where({ user_id: request.user.userId, event_id: reservation.event_id })
            .first();

          if (!scope) {
            throw new ForbiddenError('You do not have access to this reservation');
          }
        }
      }

      log.info(
        { action: 'getById', reservationId: id },
        'Retrieved reservation by id',
      );

      return reply.status(200).send({ data: reservation });
    },
  );

  // -------------------------------------------------------------------------
  // POST /reservations/:id/approve - Approve a reservation
  // -------------------------------------------------------------------------
  fastify.post(
    '/reservations/:id/approve',
    {
      preHandler: [
        authenticate,
        authorize('reservation:approve'),
        validateParams(idParamSchema),
      ],
    },
    async (request, reply) => {
      const { id } = request.params;

      const reservation = await reservationsService.approveReservation(
        request.user.userId,
        id,
      );

      log.info(
        { action: 'approve', reservationId: id },
        'Reservation approved',
      );

      return reply.status(200).send({ data: reservation });
    },
  );

  // -------------------------------------------------------------------------
  // POST /reservations/:id/release - Release a reservation
  // -------------------------------------------------------------------------
  fastify.post(
    '/reservations/:id/release',
    {
      preHandler: [
        authenticate,
        authorize('reservation:operate'),
        validateParams(idParamSchema),
      ],
    },
    async (request, reply) => {
      const { id } = request.params;

      const reservation = await reservationsService.releaseReservation(
        request.user.userId,
        id,
      );

      log.info(
        { action: 'release', reservationId: id },
        'Reservation released',
      );

      return reply.status(200).send({ data: reservation });
    },
  );

  // -------------------------------------------------------------------------
  // POST /reservations/:id/occupy - Record occupancy
  // -------------------------------------------------------------------------
  fastify.post(
    '/reservations/:id/occupy',
    {
      preHandler: [
        authenticate,
        authorize('reservation:operate'),
        validateParams(idParamSchema),
        validateBody(occupyBodySchema),
      ],
    },
    async (request, reply) => {
      const { id } = request.params;
      const { occupancy_count } = request.body;

      const reservation = await reservationsService.occupyReservation(
        request.user.userId,
        id,
        occupancy_count,
      );

      log.info(
        { action: 'occupy', reservationId: id, occupancyCount: occupancy_count },
        'Reservation occupied',
      );

      return reply.status(200).send({ data: reservation });
    },
  );

  // -------------------------------------------------------------------------
  // POST /reservations/:id/return - Return a reservation
  // -------------------------------------------------------------------------
  fastify.post(
    '/reservations/:id/return',
    {
      preHandler: [
        authenticate,
        authorize('reservation:operate'),
        validateParams(idParamSchema),
        validateBody(returnBodySchema),
      ],
    },
    async (request, reply) => {
      const { id } = request.params;
      const { actual_end_at, overtime_justification } = request.body;

      const reservation = await reservationsService.returnReservation(
        request.user.userId,
        id,
        actual_end_at,
        overtime_justification,
      );

      log.info(
        { action: 'return', reservationId: id },
        'Reservation return processed',
      );

      return reply.status(200).send({ data: reservation });
    },
  );

  // -------------------------------------------------------------------------
  // POST /reservations/:id/cancel - Cancel a reservation
  // -------------------------------------------------------------------------
  fastify.post(
    '/reservations/:id/cancel',
    {
      preHandler: [
        authenticate,
        authorize('reservation:operate'),
        validateParams(idParamSchema),
      ],
    },
    async (request, reply) => {
      const { id } = request.params;

      const reservation = await reservationsService.cancelReservation(
        request.user.userId,
        id,
      );

      log.info(
        { action: 'cancel', reservationId: id },
        'Reservation cancelled',
      );

      return reply.status(200).send({ data: reservation });
    },
  );

  // -------------------------------------------------------------------------
  // POST /reservations/:id/reschedule - Reschedule a reservation
  // -------------------------------------------------------------------------
  fastify.post(
    '/reservations/:id/reschedule',
    {
      preHandler: [
        authenticate,
        authorize('reservation:operate'),
        validateParams(idParamSchema),
        validateBody(rescheduleBodySchema),
      ],
    },
    async (request, reply) => {
      const { id } = request.params;
      const { scheduled_start_at, scheduled_end_at } = request.body;

      const result = await reservationsService.rescheduleReservation(
        request.user.userId,
        id,
        scheduled_start_at,
        scheduled_end_at,
      );

      log.info(
        { action: 'reschedule', oldId: id, newId: result.new.id },
        'Reservation rescheduled',
      );

      return reply.status(200).send({
        data: {
          old_reservation: result.old,
          new_reservation: result.new,
        },
      });
    },
  );

  // -------------------------------------------------------------------------
  // POST /reservations/:id/renew - Extend a reservation
  // -------------------------------------------------------------------------
  fastify.post(
    '/reservations/:id/renew',
    {
      preHandler: [
        authenticate,
        authorize('reservation:operate'),
        validateParams(idParamSchema),
        validateBody(renewBodySchema),
      ],
    },
    async (request, reply) => {
      const { id } = request.params;
      const { new_end_at } = request.body;

      const reservation = await reservationsService.renewReservation(
        request.user.userId,
        id,
        new_end_at,
      );

      log.info(
        { action: 'renew', reservationId: id },
        'Reservation renewed',
      );

      return reply.status(200).send({ data: reservation });
    },
  );

  // -------------------------------------------------------------------------
  // POST /reservations/:id/approve-overtime - Approve overtime
  // -------------------------------------------------------------------------
  fastify.post(
    '/reservations/:id/approve-overtime',
    {
      preHandler: [
        authenticate,
        authorize('reservation:overtime_approve'),
        validateParams(idParamSchema),
        validateBody(approveOvertimeBodySchema),
      ],
    },
    async (request, reply) => {
      const { id } = request.params;
      const { justification } = request.body;

      const reservation = await reservationsService.approveOvertime(
        request.user.userId,
        id,
        justification,
      );

      log.info(
        { action: 'approveOvertime', reservationId: id },
        'Overtime approved',
      );

      return reply.status(200).send({ data: reservation });
    },
  );
}

export default reservationsRoutes;
