/**
 * Reservations Service
 *
 * Business logic for reservation lifecycle management.
 * Handles state transitions, overtime calculations, object-level authorization,
 * and audit trail writing.
 */

import { randomUUID } from 'node:crypto';
import db from '../../db/connection.js';
import { createLogger } from '../../logging/index.js';
import { NotFoundError, ForbiddenError, AppError } from '../../shared/errors.js';
import { writeAudit } from '../../shared/audit.js';
import * as reservationsRepo from './repository.js';

const log = createLogger('reservations:service');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Verify the acting user has a manager_event_scope for the reservation's event.
 * Throws ForbiddenError if the user does not have scope access.
 *
 * @param {string} userId
 * @param {string} eventId
 * @returns {Promise<void>}
 */
async function assertEventScope(userId, eventId) {
  const scope = await db('manager_event_scopes')
    .where({ user_id: userId, event_id: eventId })
    .first();

  if (!scope) {
    throw new ForbiddenError(
      'You do not have manager scope for this event',
    );
  }
}

/**
 * Load and validate a reservation exists; throws NotFoundError if not.
 *
 * @param {string} id
 * @returns {Promise<object>}
 */
async function loadReservation(id) {
  const reservation = await reservationsRepo.findById(id);
  if (!reservation) {
    throw new NotFoundError('Reservation', id);
  }
  return reservation;
}

// ---------------------------------------------------------------------------
// Service methods
// ---------------------------------------------------------------------------

/**
 * Create a new reservation with status 'requested'.
 *
 * @param {string} userId - The user creating the reservation
 * @param {object} data
 * @param {string} data.event_id
 * @param {string} data.resource_id
 * @param {string} data.scheduled_start_at
 * @param {string} data.scheduled_end_at
 * @returns {Promise<object>} The created reservation
 */
export async function createReservation(userId, data) {
  log.info(
    { action: 'createReservation', userId, eventId: data.event_id },
    'Creating reservation',
  );

  await assertEventScope(userId, data.event_id);

  const reservation = await reservationsRepo.create({
    event_id: data.event_id,
    resource_id: data.resource_id,
    scheduled_start_at: data.scheduled_start_at,
    scheduled_end_at: data.scheduled_end_at,
    status: 'requested',
    created_by: userId,
  });

  const full = await reservationsRepo.findById(reservation.id);

  await writeAudit({
    eventId: full.event_id,
    subjectType: 'reservation',
    subjectId: reservation.id,
    action: 'create',
    actorUserId: userId,
    before: null,
    after: full,
    notes: `Reservation requested for event ${data.event_id}`,
  });

  return full;
}

/**
 * Approve a reservation (set status to 'approved').
 *
 * @param {string} userId - The approving user
 * @param {string} reservationId
 * @returns {Promise<object>}
 */
export async function approveReservation(userId, reservationId) {
  log.info(
    { action: 'approveReservation', userId, reservationId },
    'Approving reservation',
  );

  const before = await loadReservation(reservationId);
  await assertEventScope(userId, before.event_id);

  if (before.status !== 'requested') {
    throw new AppError(
      422,
      'INVALID_STATE',
      `Cannot approve a reservation with status '${before.status}'; expected 'requested'`,
    );
  }

  await reservationsRepo.update(reservationId, { status: 'approved' });
  const after = await reservationsRepo.findById(reservationId);

  await writeAudit({
    eventId: before.event_id,
    subjectType: 'reservation',
    subjectId: reservationId,
    action: 'approve',
    actorUserId: userId,
    before,
    after,
    notes: 'Reservation approved',
  });

  return after;
}

/**
 * Release a reservation (set status to 'released', record actual_start_at).
 *
 * @param {string} userId
 * @param {string} reservationId
 * @returns {Promise<object>}
 */
export async function releaseReservation(userId, reservationId) {
  log.info(
    { action: 'releaseReservation', userId, reservationId },
    'Releasing reservation',
  );

  const before = await loadReservation(reservationId);
  await assertEventScope(userId, before.event_id);

  if (before.status !== 'approved') {
    throw new AppError(
      422,
      'INVALID_STATE',
      `Cannot release a reservation with status '${before.status}'; expected 'approved'`,
    );
  }

  await reservationsRepo.update(reservationId, {
    status: 'released',
    actual_start_at: new Date().toISOString(),
  });

  const after = await reservationsRepo.findById(reservationId);

  await writeAudit({
    eventId: before.event_id,
    subjectType: 'reservation',
    subjectId: reservationId,
    action: 'release',
    actorUserId: userId,
    before,
    after,
    notes: 'Reservation released, resource now in use',
  });

  return after;
}

/**
 * Mark a reservation as 'occupied' and record occupancy count.
 *
 * @param {string} userId
 * @param {string} reservationId
 * @param {number} occupancyCount
 * @returns {Promise<object>}
 */
export async function occupyReservation(userId, reservationId, occupancyCount) {
  log.info(
    { action: 'occupyReservation', userId, reservationId, occupancyCount },
    'Occupying reservation',
  );

  const before = await loadReservation(reservationId);
  await assertEventScope(userId, before.event_id);

  if (before.status !== 'released') {
    throw new AppError(
      422,
      'INVALID_STATE',
      `Cannot occupy a reservation with status '${before.status}'; expected 'released'`,
    );
  }

  await reservationsRepo.update(reservationId, {
    status: 'occupied',
    occupancy_count: occupancyCount,
  });

  const after = await reservationsRepo.findById(reservationId);

  await writeAudit({
    eventId: before.event_id,
    subjectType: 'reservation',
    subjectId: reservationId,
    action: 'occupy',
    actorUserId: userId,
    before,
    after,
    notes: `Reservation occupied with ${occupancyCount} occupants`,
  });

  return after;
}

/**
 * Return a reservation. Calculates overtime and handles the overtime approval
 * workflow if overtime exceeds 30 minutes.
 *
 * @param {string} userId
 * @param {string} reservationId
 * @param {string} actualEndAt - ISO timestamp of actual end
 * @param {string} [overtimeJustification] - Required if overtime > 30 min
 * @returns {Promise<object>}
 */
export async function returnReservation(userId, reservationId, actualEndAt, overtimeJustification) {
  log.info(
    { action: 'returnReservation', userId, reservationId },
    'Returning reservation',
  );

  const before = await loadReservation(reservationId);
  await assertEventScope(userId, before.event_id);

  if (before.status !== 'occupied') {
    throw new AppError(
      422,
      'INVALID_STATE',
      `Cannot return a reservation with status '${before.status}'; expected 'occupied'`,
    );
  }

  // Calculate overtime
  const scheduledEnd = new Date(before.scheduled_end_at).getTime();
  const actualEnd = new Date(actualEndAt).getTime();
  const overtimeMinutes = Math.max(0, Math.floor((actualEnd - scheduledEnd) / 60000));

  if (overtimeMinutes > 30) {
    // Overtime exceeds threshold - require justification and approval
    if (!overtimeJustification) {
      throw new AppError(
        422,
        'OVERTIME_JUSTIFICATION_REQUIRED',
        'Overtime exceeds 30 minutes; overtime_justification is required',
      );
    }

    await reservationsRepo.update(reservationId, {
      actual_end_at: actualEndAt,
      overtime_minutes: overtimeMinutes,
      overtime_justification: overtimeJustification,
      overtime_pending_approval: true,
      // Status stays 'occupied' until overtime is approved
    });

    // Create an overtime approval record
    await db('approvals').insert({
      event_id: before.event_id,
      approval_type: 'overtime',
      status: 'pending',
      requested_by: userId,
      justification: overtimeJustification,
    });

    const after = await reservationsRepo.findById(reservationId);

    await writeAudit({
      eventId: before.event_id,
      subjectType: 'reservation',
      subjectId: reservationId,
      action: 'return_overtime_pending',
      actorUserId: userId,
      before,
      after,
      notes: `Reservation return with ${overtimeMinutes} min overtime (pending approval)`,
    });

    return after;
  }

  // Overtime within threshold - mark as returned directly
  await reservationsRepo.update(reservationId, {
    status: 'returned',
    actual_end_at: actualEndAt,
    overtime_minutes: overtimeMinutes,
  });

  const after = await reservationsRepo.findById(reservationId);

  await writeAudit({
    eventId: before.event_id,
    subjectType: 'reservation',
    subjectId: reservationId,
    action: 'return',
    actorUserId: userId,
    before,
    after,
    notes: overtimeMinutes > 0
      ? `Reservation returned with ${overtimeMinutes} min overtime (within threshold)`
      : 'Reservation returned on time',
  });

  return after;
}

/**
 * Cancel a reservation.
 *
 * @param {string} userId
 * @param {string} reservationId
 * @returns {Promise<object>}
 */
export async function cancelReservation(userId, reservationId) {
  log.info(
    { action: 'cancelReservation', userId, reservationId },
    'Cancelling reservation',
  );

  const before = await loadReservation(reservationId);
  await assertEventScope(userId, before.event_id);

  if (['cancelled', 'returned', 'rescheduled'].includes(before.status)) {
    throw new AppError(
      422,
      'INVALID_STATE',
      `Cannot cancel a reservation with status '${before.status}'`,
    );
  }

  await reservationsRepo.update(reservationId, { status: 'cancelled' });
  const after = await reservationsRepo.findById(reservationId);

  await writeAudit({
    eventId: before.event_id,
    subjectType: 'reservation',
    subjectId: reservationId,
    action: 'cancel',
    actorUserId: userId,
    before,
    after,
    notes: 'Reservation cancelled',
  });

  return after;
}

/**
 * Reschedule a reservation: create a new reservation and mark the old one as 'rescheduled'.
 *
 * @param {string} userId
 * @param {string} reservationId
 * @param {string} newStart - ISO timestamp
 * @param {string} newEnd   - ISO timestamp
 * @returns {Promise<{ old: object, new: object }>}
 */
export async function rescheduleReservation(userId, reservationId, newStart, newEnd) {
  log.info(
    { action: 'rescheduleReservation', userId, reservationId },
    'Rescheduling reservation',
  );

  const before = await loadReservation(reservationId);
  await assertEventScope(userId, before.event_id);

  if (['cancelled', 'returned', 'rescheduled'].includes(before.status)) {
    throw new AppError(
      422,
      'INVALID_STATE',
      `Cannot reschedule a reservation with status '${before.status}'`,
    );
  }

  // Mark old reservation as rescheduled
  await reservationsRepo.update(reservationId, { status: 'rescheduled' });
  const oldAfter = await reservationsRepo.findById(reservationId);

  // Create new reservation
  const newReservation = await reservationsRepo.create({
    event_id: before.event_id,
    resource_id: before.resource_id,
    scheduled_start_at: newStart,
    scheduled_end_at: newEnd,
    status: 'requested',
    created_by: userId,
  });
  const newFull = await reservationsRepo.findById(newReservation.id);

  // Audit both
  await writeAudit({
    eventId: before.event_id,
    subjectType: 'reservation',
    subjectId: reservationId,
    action: 'reschedule_old',
    actorUserId: userId,
    before,
    after: oldAfter,
    notes: `Reservation rescheduled; replaced by ${newReservation.id}`,
  });

  await writeAudit({
    eventId: before.event_id,
    subjectType: 'reservation',
    subjectId: newReservation.id,
    action: 'reschedule_new',
    actorUserId: userId,
    before: null,
    after: newFull,
    notes: `New reservation created from reschedule of ${reservationId}`,
  });

  return { old: oldAfter, new: newFull };
}

/**
 * Renew (extend) a reservation by updating scheduled_end_at.
 *
 * @param {string} userId
 * @param {string} reservationId
 * @param {string} newEnd - ISO timestamp for the new end time
 * @returns {Promise<object>}
 */
export async function renewReservation(userId, reservationId, newEnd) {
  log.info(
    { action: 'renewReservation', userId, reservationId },
    'Renewing reservation',
  );

  const before = await loadReservation(reservationId);
  await assertEventScope(userId, before.event_id);

  if (['cancelled', 'returned', 'rescheduled'].includes(before.status)) {
    throw new AppError(
      422,
      'INVALID_STATE',
      `Cannot renew a reservation with status '${before.status}'`,
    );
  }

  await reservationsRepo.update(reservationId, {
    scheduled_end_at: newEnd,
  });

  const after = await reservationsRepo.findById(reservationId);

  await writeAudit({
    eventId: before.event_id,
    subjectType: 'reservation',
    subjectId: reservationId,
    action: 'renew',
    actorUserId: userId,
    before,
    after,
    notes: `Reservation renewed; new end time: ${newEnd}`,
  });

  return after;
}

/**
 * Approve overtime for a reservation: clear the overtime pending flag,
 * record approval details, and set status to 'returned'.
 *
 * @param {string} userId - The approving user
 * @param {string} reservationId
 * @param {string} justification - Approval justification/notes
 * @returns {Promise<object>}
 */
export async function approveOvertime(userId, reservationId, justification) {
  log.info(
    { action: 'approveOvertime', userId, reservationId },
    'Approving overtime',
  );

  const before = await loadReservation(reservationId);
  await assertEventScope(userId, before.event_id);

  if (!before.overtime_pending_approval) {
    throw new AppError(
      422,
      'INVALID_STATE',
      'This reservation does not have overtime pending approval',
    );
  }

  const now = new Date().toISOString();

  await reservationsRepo.update(reservationId, {
    status: 'returned',
    overtime_pending_approval: false,
    overtime_approved_by: userId,
    overtime_approved_at: now,
  });

  // Also update the related approval record
  await db('approvals')
    .where({
      event_id: before.event_id,
      approval_type: 'overtime',
      status: 'pending',
    })
    .update({
      status: 'approved',
      first_approver_id: userId,
      justification,
      decided_at: now,
    });

  const after = await reservationsRepo.findById(reservationId);

  await writeAudit({
    eventId: before.event_id,
    subjectType: 'reservation',
    subjectId: reservationId,
    action: 'approve_overtime',
    actorUserId: userId,
    before,
    after,
    notes: `Overtime approved (${before.overtime_minutes} min): ${justification}`,
  });

  return after;
}
