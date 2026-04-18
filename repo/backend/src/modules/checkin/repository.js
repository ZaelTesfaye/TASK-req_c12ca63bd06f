/**
 * Check-In Repository
 *
 * Database access layer for event check-in records and occupancy tracking.
 */

import db from '../../db/connection.js';
import { createLogger } from '../../logging/index.js';

const log = createLogger('checkin:repository');

/**
 * Create a check-in record.
 *
 * @param {object} data
 * @returns {Promise<object>} The inserted check-in record
 */
export async function create(data) {
  log.info(
    { action: 'create', eventId: data.event_id, attendee: data.attendee_label },
    'Inserting check-in record',
  );

  const [checkIn] = await db('event_checkins')
    .insert({
      event_id: data.event_id,
      attendee_label: data.attendee_label,
      checked_in_by: data.checked_in_by,
      window_id: data.window_id || null,
      outside_window: data.outside_window || false,
      over_cap: data.over_cap || false,
      over_cap_reason: data.over_cap_reason || null,
    })
    .returning('*');

  return checkIn;
}

/**
 * List check-ins for a specific event.
 *
 * @param {string} eventId - UUID
 * @returns {Promise<object[]>}
 */
export async function findByEvent(eventId) {
  log.debug({ action: 'findByEvent', eventId }, 'Listing check-ins for event');

  return db('event_checkins')
    .where({ event_id: eventId })
    .orderBy('checked_in_at', 'asc');
}

/**
 * Get the current occupancy count for an event.
 *
 * @param {string} eventId - UUID
 * @returns {Promise<number>}
 */
export async function getOccupancyCount(eventId) {
  log.debug({ action: 'getOccupancyCount', eventId }, 'Counting check-ins for event');

  const [{ count }] = await db('event_checkins')
    .where({ event_id: eventId })
    .count('id as count');

  return Number(count);
}

/**
 * Get check-ins for a specific event service window.
 *
 * @param {string} eventId - UUID
 * @param {string} windowId - UUID
 * @returns {Promise<object[]>}
 */
export async function getActiveWindowCheckIns(eventId, windowId) {
  log.debug(
    { action: 'getActiveWindowCheckIns', eventId, windowId },
    'Listing check-ins for service window',
  );

  return db('event_checkins')
    .where({ event_id: eventId, window_id: windowId })
    .orderBy('checked_in_at', 'asc');
}
