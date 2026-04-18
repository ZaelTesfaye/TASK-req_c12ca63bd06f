/**
 * Approvals Repository
 *
 * Database access layer for approval-related operations.
 * All functions return plain objects (no ORM models).
 */

import db from '../../db/connection.js';
import { createLogger } from '../../logging/index.js';

const log = createLogger('approvals:repository');

/**
 * Create a new approval record.
 *
 * @param {object} data - Approval fields
 * @returns {Promise<object>} The created approval with id
 */
export async function create(data) {
  log.debug({ action: 'create', data }, 'Creating approval');

  const [approval] = await db('approvals')
    .insert(data)
    .returning('*');

  return approval;
}

/**
 * Find an approval by ID, including event info.
 *
 * @param {string} id - Approval UUID
 * @returns {Promise<object|null>} Approval record with event info, or null
 */
export async function findById(id) {
  log.debug({ action: 'findById', id }, 'Looking up approval by id');

  const approval = await db('approvals')
    .select(
      'approvals.*',
      'events.title as event_title',
      'events.state as event_state',
      'users.username as requested_by_username',
    )
    .leftJoin('events', 'events.id', 'approvals.event_id')
    .leftJoin('users', 'users.id', 'approvals.requested_by')
    .where('approvals.id', id)
    .first();

  return approval || null;
}

/**
 * Find pending approvals with optional filtering and pagination.
 *
 * @param {object}  opts
 * @param {number}  opts.page
 * @param {number}  opts.pageSize
 * @param {string}  [opts.approvalType] - Filter by approval_type
 * @returns {Promise<{ data: object[], total: number }>}
 */
export async function findPending({ page = 1, pageSize = 20, approvalType }) {
  log.debug({ action: 'findPending', page, pageSize, approvalType }, 'Listing pending approvals');

  let countQuery = db('approvals').where('status', 'pending');
  let query = db('approvals')
    .select(
      'approvals.*',
      'events.title as event_title',
      'events.state as event_state',
      'users.username as requested_by_username',
    )
    .leftJoin('events', 'events.id', 'approvals.event_id')
    .leftJoin('users', 'users.id', 'approvals.requested_by')
    .where('approvals.status', 'pending');

  if (approvalType) {
    countQuery = countQuery.where('approval_type', approvalType);
    query = query.where('approvals.approval_type', approvalType);
  }

  const [{ count }] = await countQuery.count('id as count');
  const total = Number(count);

  const offset = (page - 1) * pageSize;
  const data = await query
    .orderBy('approvals.created_at', 'desc')
    .limit(pageSize)
    .offset(offset);

  return { data, total };
}

/**
 * Find all approvals for a given event.
 *
 * @param {string} eventId - Event UUID
 * @returns {Promise<object[]>}
 */
export async function findByEventId(eventId) {
  log.debug({ action: 'findByEventId', eventId }, 'Listing approvals for event');

  return db('approvals')
    .where({ event_id: eventId })
    .orderBy('created_at', 'desc');
}

/**
 * Update an approval record.
 *
 * @param {string} id   - Approval UUID
 * @param {object} data - Fields to update (status, first_approver_id, second_approver_id, decided_at, justification)
 * @returns {Promise<object|null>} Updated approval or null if not found
 */
export async function update(id, data) {
  log.info({ action: 'update', id }, 'Updating approval');

  const [updated] = await db('approvals')
    .where({ id })
    .update(data)
    .returning('*');

  return updated || null;
}

/**
 * Check whether there are any pending approvals for a given event.
 *
 * @param {string} eventId - Event UUID
 * @returns {Promise<boolean>}
 */
export async function hasPendingForEvent(eventId) {
  log.debug({ action: 'hasPendingForEvent', eventId }, 'Checking pending approvals for event');

  const result = await db('approvals')
    .where({ event_id: eventId, status: 'pending' })
    .count('id as count')
    .first();

  return Number(result.count) > 0;
}
