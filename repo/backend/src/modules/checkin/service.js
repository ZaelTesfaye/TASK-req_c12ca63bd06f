/**
 * Check-In Service
 *
 * Business logic for event check-in: verifying event state,
 * service window matching, capacity enforcement, and audit logging.
 */

import db from '../../db/connection.js';
import { createLogger } from '../../logging/index.js';
import { writeAudit } from '../../shared/audit.js';
import { AppError, ForbiddenError, NotFoundError } from '../../shared/errors.js';
import * as checkinRepo from './repository.js';

const log = createLogger('checkin:service');

/**
 * Verify the user is eligible to act on the given event.
 * Passes for admins, the event creator, or users with an explicit
 * manager_event_scopes row for the event. Otherwise throws ForbiddenError.
 *
 * @param {{ userId: string, roles?: string[] }} user
 * @param {object} event - Loaded event row
 * @returns {Promise<void>}
 */
export async function assertEventAccess(user, event) {
  if (user.roles && user.roles.includes('admin')) return;
  if (event.created_by === user.userId) return;

  const scope = await db('manager_event_scopes')
    .where({ user_id: user.userId, event_id: event.id })
    .first();
  if (scope) return;

  throw new ForbiddenError('You do not have access to this event');
}

/**
 * Perform a check-in for an event attendee.
 *
 * @param {{ userId: string, roles?: string[] }} user - Actor (staff) performing the check-in
 * @param {string} eventId - Event UUID
 * @param {object} data - { attendee_label, over_cap_reason? }
 * @returns {Promise<{ checkIn: object, warning: boolean, warningMessage?: string, occupancy: number }>}
 */
export async function checkIn(user, eventId, data) {
  const userId = user.userId;
  log.info(
    { action: 'checkIn', userId, eventId, attendee: data.attendee_label },
    'Processing event check-in',
  );

  // 1. Find event, verify state
  const event = await db('events').where({ id: eventId }).first();
  if (!event) {
    throw new NotFoundError('Event', eventId);
  }

  // Object-level eligibility: admin, event creator, or manager scope.
  await assertEventAccess(user, event);

  const allowedStates = ['in_service', 'approved'];
  if (!allowedStates.includes(event.state)) {
    throw new AppError(
      422,
      'INVALID_EVENT_STATE',
      `Event is in '${event.state}' state; check-in requires 'in_service' or 'approved'`,
      { currentState: event.state, allowedStates },
    );
  }

  // 2. Find current active service window
  const now = new Date();
  const activeWindow = await db('event_service_windows')
    .where({ event_id: eventId })
    .where('start_at', '<=', now)
    .where('end_at', '>=', now)
    .first();

  const outsideWindow = !activeWindow;
  let warning = false;
  let warningMessage;

  if (outsideWindow) {
    warning = true;
    warningMessage = 'Check-in recorded outside of any active service window';
  }

  // 3. Get current occupancy
  const currentOccupancy = await checkinRepo.getOccupancyCount(eventId);

  // 4. Capacity check
  let overCap = false;
  if (currentOccupancy >= event.headcount) {
    if (!data.over_cap_reason) {
      throw new AppError(
        422,
        'OVER_CAPACITY',
        `Event is at capacity (${currentOccupancy}/${event.headcount}). Provide over_cap_reason to proceed.`,
        { currentOccupancy, headcount: event.headcount },
      );
    }

    overCap = true;
    warning = true;
    warningMessage = `Over-capacity check-in (${currentOccupancy + 1}/${event.headcount})`;

    // Flag for approver review via audit entry
    await writeAudit({
      eventId: event.id,
      subjectType: 'event_checkin',
      subjectId: event.id,
      action: 'over_capacity_flag',
      actorUserId: userId,
      before: null,
      after: {
        currentOccupancy,
        headcount: event.headcount,
        attendee_label: data.attendee_label,
        over_cap_reason: data.over_cap_reason,
      },
      notes: `Over-capacity check-in flagged for review: ${data.over_cap_reason}`,
    });
  }

  // 5. Create check-in record
  const checkInRecord = await checkinRepo.create({
    event_id: eventId,
    attendee_label: data.attendee_label,
    checked_in_by: userId,
    window_id: activeWindow ? activeWindow.id : null,
    outside_window: outsideWindow,
    over_cap: overCap,
    over_cap_reason: overCap ? data.over_cap_reason : null,
  });

  // 6. Write audit trail
  await writeAudit({
    eventId: event.id,
    subjectType: 'event_checkin',
    subjectId: checkInRecord.id,
    action: 'check_in',
    actorUserId: userId,
    before: null,
    after: {
      attendee_label: data.attendee_label,
      window_id: activeWindow?.id || null,
      outside_window: outsideWindow,
      over_cap: overCap,
    },
    notes: `Checked in '${data.attendee_label}' for event ${eventId}`,
  });

  const newOccupancy = currentOccupancy + 1;

  log.info(
    { action: 'checkIn', checkInId: checkInRecord.id, occupancy: newOccupancy },
    `Check-in completed, occupancy now ${newOccupancy}/${event.headcount}`,
  );

  // 7. Return result
  return {
    checkIn: checkInRecord,
    warning,
    warningMessage: warning ? warningMessage : undefined,
    occupancy: newOccupancy,
  };
}
