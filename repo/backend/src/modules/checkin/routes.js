/**
 * Check-In Routes
 *
 * Fastify plugin that registers check-in endpoints under the /events/:id prefix.
 * Handles attendee check-in and occupancy queries.
 */

import { z } from 'zod';
import { createLogger } from '../../logging/index.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateParams, validateBody } from '../../middleware/validate.js';
import { NotFoundError } from '../../shared/errors.js';
import db from '../../db/connection.js';
import * as checkinRepo from './repository.js';
import * as checkinService from './service.js';

const log = createLogger('checkin:routes');

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const eventIdParamSchema = z.object({
  id: z.string().uuid(),
});

const checkInBodySchema = z.object({
  attendee_label: z.string().min(1).max(200),
  over_cap_reason: z.string().max(2000).optional(),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {object} _opts
 */
async function checkinRoutes(fastify, _opts) {

  // -------------------------------------------------------------------------
  // POST /events/:id/check-in - Check in an attendee
  // -------------------------------------------------------------------------
  fastify.post(
    '/events/:id/check-in',
    {
      preHandler: [
        authenticate,
        authorize('event:service'),
        validateParams(eventIdParamSchema),
        validateBody(checkInBodySchema),
      ],
    },
    async (request, reply) => {
      const { id: eventId } = request.params;
      const { attendee_label, over_cap_reason } = request.body;

      const result = await checkinService.checkIn(
        { userId: request.user.userId, roles: request.user.roles },
        eventId,
        { attendee_label, over_cap_reason },
      );

      log.info(
        { action: 'checkIn', eventId, occupancy: result.occupancy },
        'Attendee checked in',
      );

      return reply.status(201).send({ data: result });
    },
  );

  // -------------------------------------------------------------------------
  // GET /events/:id/check-in - List check-ins and occupancy for an event
  // -------------------------------------------------------------------------
  fastify.get(
    '/events/:id/check-in',
    {
      preHandler: [
        authenticate,
        authorize('event:read'),
        validateParams(eventIdParamSchema),
      ],
    },
    async (request, reply) => {
      const { id: eventId } = request.params;

      const event = await db('events').where({ id: eventId }).first();
      if (!event) {
        throw new NotFoundError('Event', eventId);
      }

      // Object-level eligibility check before exposing check-in data.
      await checkinService.assertEventAccess(
        { userId: request.user.userId, roles: request.user.roles },
        event,
      );

      const checkIns = await checkinRepo.findByEvent(eventId);
      const occupancy = await checkinRepo.getOccupancyCount(eventId);

      log.info(
        { action: 'listCheckIns', eventId, count: checkIns.length },
        'Listed check-ins for event',
      );

      return reply.status(200).send({
        data: {
          checkIns,
          occupancy,
        },
      });
    },
  );
}

export default checkinRoutes;
