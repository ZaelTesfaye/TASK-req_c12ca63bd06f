/**
 * Reservations Repository
 *
 * Database access layer for reservation-related operations.
 * All functions return plain objects (no ORM models).
 */

import db from '../../db/connection.js';
import { createLogger } from '../../logging/index.js';
import { applyPagination } from '../../shared/pagination.js';

const log = createLogger('reservations:repository');

// ---------------------------------------------------------------------------
// Allowed sort columns for paginated queries
// ---------------------------------------------------------------------------
const ALLOWED_SORTS = [
  'status',
  'scheduled_start_at',
  'scheduled_end_at',
  'created_at',
  'updated_at',
];

/**
 * Create a new reservation.
 *
 * @param {object} data
 * @param {string} data.event_id
 * @param {string} data.resource_id
 * @param {string} data.scheduled_start_at
 * @param {string} data.scheduled_end_at
 * @param {string} data.created_by
 * @param {string} [data.status]
 * @returns {Promise<object>} The created reservation row
 */
export async function create(data) {
  log.info(
    { action: 'create', eventId: data.event_id, resourceId: data.resource_id },
    'Creating reservation',
  );

  const [reservation] = await db('reservations')
    .insert({
      event_id: data.event_id,
      resource_id: data.resource_id,
      status: data.status || 'requested',
      scheduled_start_at: data.scheduled_start_at,
      scheduled_end_at: data.scheduled_end_at,
      created_by: data.created_by,
    })
    .returning('*');

  return reservation;
}

/**
 * Find a reservation by ID, including resource and event info.
 *
 * @param {string} id - Reservation UUID
 * @returns {Promise<object|null>}
 */
export async function findById(id) {
  log.debug({ action: 'findById', id }, 'Looking up reservation by id');

  const reservation = await db('reservations')
    .select(
      'reservations.*',
      'resources.name as resource_name',
      'resources.resource_type',
      'events.title as event_title',
      'events.event_date',
    )
    .leftJoin('resources', 'resources.id', 'reservations.resource_id')
    .leftJoin('events', 'events.id', 'reservations.event_id')
    .where('reservations.id', id)
    .first();

  return reservation || null;
}

/**
 * Return a paginated list of reservations with optional filters.
 *
 * When `scope` is provided, results are restricted to reservations the
 * caller can see. The scope is applied BEFORE counting so pagination
 * metadata (total/totalPages) reflects the visible rows, not the raw DB.
 *
 * @param {object} filters
 * @param {number}  filters.page
 * @param {number}  filters.pageSize
 * @param {string}  [filters.sortBy]
 * @param {'asc'|'desc'} [filters.sortDir]
 * @param {string}  [filters.status]
 * @param {string}  [filters.event_id]
 * @param {string}  [filters.resource_id]
 * @param {{ userId: string, scopedEventIds: string[] }} [filters.scope]
 *   When set, limits results to reservations whose event_id is in
 *   scopedEventIds OR whose created_by matches userId.
 * @returns {Promise<{ data: object[], total: number }>}
 */
export async function findAll(filters) {
  const {
    page = 1,
    pageSize = 20,
    sortBy,
    sortDir = 'asc',
    status,
    event_id,
    resource_id,
    scope,
  } = filters;

  log.debug(
    { action: 'findAll', page, pageSize, status, event_id, scoped: !!scope },
    'Listing reservations',
  );

  let baseQuery = db('reservations')
    .leftJoin('resources', 'resources.id', 'reservations.resource_id')
    .leftJoin('events', 'events.id', 'reservations.event_id');

  if (status) {
    baseQuery = baseQuery.where('reservations.status', status);
  }
  if (event_id) {
    baseQuery = baseQuery.where('reservations.event_id', event_id);
  }
  if (resource_id) {
    baseQuery = baseQuery.where('reservations.resource_id', resource_id);
  }

  if (scope) {
    const scopedEventIds = scope.scopedEventIds || [];
    baseQuery = baseQuery.where((qb) => {
      qb.where('reservations.created_by', scope.userId);
      if (scopedEventIds.length > 0) {
        qb.orWhereIn('reservations.event_id', scopedEventIds);
      }
    });
  }

  // Count total rows (after scope/status/event/resource filters)
  const [{ count }] = await baseQuery.clone().count('reservations.id as count');
  const total = Number(count);

  // Build paginated query
  let query = baseQuery
    .clone()
    .select(
      'reservations.*',
      'resources.name as resource_name',
      'resources.resource_type',
      'events.title as event_title',
      'events.event_date',
    );

  query = applyPagination(query, {
    page,
    pageSize,
    sortBy: sortBy ? `reservations.${sortBy}` : 'reservations.created_at',
    sortDir: sortBy ? sortDir : 'desc',
    allowedSorts: ALLOWED_SORTS.map((s) => `reservations.${s}`),
  });

  const data = await query;

  return { data, total };
}

/**
 * Find all reservations for a specific event.
 *
 * @param {string} eventId
 * @returns {Promise<object[]>}
 */
export async function findByEventId(eventId) {
  log.debug({ action: 'findByEventId', eventId }, 'Listing reservations for event');

  return db('reservations')
    .select(
      'reservations.*',
      'resources.name as resource_name',
      'resources.resource_type',
    )
    .leftJoin('resources', 'resources.id', 'reservations.resource_id')
    .where('reservations.event_id', eventId)
    .orderBy('reservations.scheduled_start_at', 'asc');
}

/**
 * Update reservation fields.
 *
 * @param {string} id
 * @param {object} data - Fields to update
 * @returns {Promise<object|null>} Updated reservation or null if not found
 */
export async function update(id, data) {
  log.info({ action: 'update', id }, 'Updating reservation');

  const updatePayload = {};

  if (data.status !== undefined) updatePayload.status = data.status;
  if (data.scheduled_start_at !== undefined) updatePayload.scheduled_start_at = data.scheduled_start_at;
  if (data.scheduled_end_at !== undefined) updatePayload.scheduled_end_at = data.scheduled_end_at;
  if (data.actual_start_at !== undefined) updatePayload.actual_start_at = data.actual_start_at;
  if (data.actual_end_at !== undefined) updatePayload.actual_end_at = data.actual_end_at;
  if (data.occupancy_count !== undefined) updatePayload.occupancy_count = data.occupancy_count;
  if (data.overtime_minutes !== undefined) updatePayload.overtime_minutes = data.overtime_minutes;
  if (data.overtime_justification !== undefined) updatePayload.overtime_justification = data.overtime_justification;
  if (data.overtime_pending_approval !== undefined) updatePayload.overtime_pending_approval = data.overtime_pending_approval;
  if (data.overtime_approved_by !== undefined) updatePayload.overtime_approved_by = data.overtime_approved_by;
  if (data.overtime_approved_at !== undefined) updatePayload.overtime_approved_at = data.overtime_approved_at;

  if (Object.keys(updatePayload).length === 0) return findById(id);

  const [updated] = await db('reservations')
    .where({ id })
    .update(updatePayload)
    .returning('*');

  return updated || null;
}

/**
 * Check whether any reservation for the given event is active
 * (i.e. not cancelled and not returned).
 *
 * @param {string} eventId
 * @returns {Promise<boolean>}
 */
export async function hasActiveForEvent(eventId) {
  log.debug({ action: 'hasActiveForEvent', eventId }, 'Checking active reservations for event');

  const row = await db('reservations')
    .where('event_id', eventId)
    .whereNotIn('status', ['cancelled', 'returned'])
    .first();

  return !!row;
}
