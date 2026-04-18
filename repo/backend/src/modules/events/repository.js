/**
 * Events Repository
 *
 * Database access layer for event-related operations.
 * All functions return plain objects (no ORM models).
 */

import db from '../../db/connection.js';
import { createLogger } from '../../logging/index.js';

const log = createLogger('events:repository');

// ---------------------------------------------------------------------------
// Allowed sort columns for the paginated list query
// ---------------------------------------------------------------------------
const ALLOWED_SORTS = ['title', 'event_date', 'headcount', 'state', 'budget_amount', 'created_at', 'updated_at'];

/**
 * Create a new event.
 *
 * @param {object} data - Event fields (title, description, event_date, headcount, budget_amount, budget_cap, state, created_by)
 * @returns {Promise<object>} The created event with id
 */
export async function create(data) {
  log.debug({ action: 'create', data }, 'Creating event');

  const [event] = await db('events')
    .insert(data)
    .returning('*');

  return event;
}

/**
 * Find an event by ID, including creator info.
 *
 * @param {string} id - Event UUID
 * @returns {Promise<object|null>} Event record with creator info, or null
 */
export async function findById(id) {
  log.debug({ action: 'findById', id }, 'Looking up event by id');

  const event = await db('events')
    .select(
      'events.*',
      'users.username as creator_username',
    )
    .leftJoin('users', 'users.id', 'events.created_by')
    .where('events.id', id)
    .first();

  return event || null;
}

/**
 * Return a paginated list of events with optional filters.
 *
 * @param {object}  opts
 * @param {number}  opts.page
 * @param {number}  opts.pageSize
 * @param {string}  [opts.state]     - Filter by event state
 * @param {string}  [opts.fromDate]  - Filter events on or after this date
 * @param {string}  [opts.toDate]    - Filter events on or before this date
 * @param {string}  [opts.search]    - Case-insensitive substring match on title/description
 * @param {string}  [opts.sortBy]
 * @param {'asc'|'desc'} [opts.sortDir]
 * @returns {Promise<{ data: object[], total: number }>}
 */
export async function findAll({ page = 1, pageSize = 20, state, fromDate, toDate, search, sortBy, sortDir = 'asc' }) {
  log.debug({ action: 'findAll', page, pageSize, state, fromDate, toDate, search, sortBy, sortDir }, 'Listing events');

  let countQuery = db('events');
  let query = db('events').select(
    'events.*',
    'users.username as creator_username',
  ).leftJoin('users', 'users.id', 'events.created_by');

  // Apply filters
  if (state) {
    countQuery = countQuery.where('events.state', state);
    query = query.where('events.state', state);
  }
  if (fromDate) {
    countQuery = countQuery.where('events.event_date', '>=', fromDate);
    query = query.where('events.event_date', '>=', fromDate);
  }
  if (toDate) {
    countQuery = countQuery.where('events.event_date', '<=', toDate);
    query = query.where('events.event_date', '<=', toDate);
  }
  if (search) {
    const pattern = `%${search}%`;
    const applySearch = (qb) => {
      qb.where((w) => {
        w.where('events.title', 'ilike', pattern)
          .orWhere('events.description', 'ilike', pattern);
      });
    };
    applySearch(countQuery);
    applySearch(query);
  }

  // Count total rows
  const [{ count }] = await countQuery.count('id as count');
  const total = Number(count);

  // Apply sorting
  if (sortBy && ALLOWED_SORTS.includes(sortBy)) {
    query = query.orderBy(`events.${sortBy}`, sortDir);
  } else {
    query = query.orderBy('events.created_at', 'desc');
  }

  const offset = (page - 1) * pageSize;
  const data = await query.limit(pageSize).offset(offset);

  return { data, total };
}

/**
 * Update event fields.
 *
 * @param {string} id   - Event UUID
 * @param {object} data - Fields to update
 * @returns {Promise<object|null>} Updated event or null if not found
 */
export async function update(id, data) {
  log.info({ action: 'update', id }, 'Updating event');

  const [updated] = await db('events')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*');

  return updated || null;
}

/**
 * Update the state column of an event.
 *
 * @param {string} id        - Event UUID
 * @param {string} newState  - New state value
 * @param {Date}   [approvedAt] - Timestamp for when event was approved
 * @returns {Promise<object|null>} Updated event or null
 */
export async function updateState(id, newState, approvedAt = undefined) {
  log.info({ action: 'updateState', id, newState }, 'Updating event state');

  const updateData = { state: newState, updated_at: db.fn.now() };
  if (approvedAt !== undefined) {
    updateData.approved_at = approvedAt;
  }

  const [updated] = await db('events')
    .where({ id })
    .update(updateData)
    .returning('*');

  return updated || null;
}

/**
 * Get service windows for an event.
 *
 * @param {string} eventId - Event UUID
 * @returns {Promise<object[]>}
 */
export async function getServiceWindows(eventId) {
  log.debug({ action: 'getServiceWindows', eventId }, 'Listing service windows');

  return db('event_service_windows')
    .where({ event_id: eventId })
    .orderBy('start_at', 'asc');
}

/**
 * Add a service window to an event, validating no overlaps with existing windows.
 *
 * @param {object} data - { event_id, label, start_at, end_at }
 * @returns {Promise<object>} The created service window
 * @throws {Error} If the window overlaps with an existing one
 */
export async function addServiceWindow(data) {
  log.debug({ action: 'addServiceWindow', data }, 'Adding service window');

  // Check for overlapping windows for the same event
  const overlapping = await db('event_service_windows')
    .where('event_id', data.event_id)
    .where(function () {
      this.where('start_at', '<', data.end_at)
        .andWhere('end_at', '>', data.start_at);
    })
    .first();

  if (overlapping) {
    const err = new Error(
      `Service window overlaps with existing window '${overlapping.label}' (${overlapping.start_at} - ${overlapping.end_at})`,
    );
    err.statusCode = 409;
    err.code = 'CONFLICT';
    throw err;
  }

  const [window] = await db('event_service_windows')
    .insert(data)
    .returning('*');

  return window;
}

/**
 * Delete a service window, scoped to its owning event.
 *
 * @param {string} id      - Service window UUID
 * @param {string} eventId - Parent event UUID (scope guard)
 * @returns {Promise<number>} Number of deleted rows (0 if mismatch)
 */
export async function removeServiceWindow(id, eventId) {
  log.info({ action: 'removeServiceWindow', id, eventId }, 'Removing service window');

  return db('event_service_windows')
    .where({ id, event_id: eventId })
    .del();
}

/**
 * Get materials for an event with recipe/rental info.
 *
 * @param {string} eventId - Event UUID
 * @returns {Promise<object[]>}
 */
export async function getMaterials(eventId) {
  log.debug({ action: 'getMaterials', eventId }, 'Listing materials');

  return db('event_materials')
    .select(
      'event_materials.*',
      'recipe_versions.title as recipe_version_title',
      'recipe_versions.status as recipe_version_status',
      'resources.name as rental_resource_name',
    )
    .leftJoin('recipe_versions', 'recipe_versions.id', 'event_materials.recipe_version_id')
    .leftJoin('resources', 'resources.id', 'event_materials.rental_resource_id')
    .where('event_materials.event_id', eventId);
}

/**
 * Add a material to an event.
 *
 * @param {object} data - { event_id, material_type, recipe_version_id?, rental_resource_id?, display_quantity, unit }
 * @returns {Promise<object>} The created material
 */
export async function addMaterial(data) {
  log.debug({ action: 'addMaterial', data }, 'Adding material');

  const [material] = await db('event_materials')
    .insert(data)
    .returning('*');

  return material;
}

/**
 * Remove a material, scoped to its owning event.
 *
 * @param {string} id      - Material UUID
 * @param {string} eventId - Parent event UUID (scope guard)
 * @returns {Promise<number>} Number of deleted rows (0 if mismatch)
 */
export async function removeMaterial(id, eventId) {
  log.info({ action: 'removeMaterial', id, eventId }, 'Removing material');

  return db('event_materials')
    .where({ id, event_id: eventId })
    .del();
}

/**
 * Get resource requests for an event.
 *
 * @param {string} eventId - Event UUID
 * @returns {Promise<object[]>}
 */
export async function getResourceRequests(eventId) {
  log.debug({ action: 'getResourceRequests', eventId }, 'Listing resource requests');

  return db('event_resource_requests')
    .select(
      'event_resource_requests.*',
      'resources.name as resource_name',
      'resources.resource_type',
      'resources.requires_approval',
      'resources.quota_per_event',
    )
    .leftJoin('resources', 'resources.id', 'event_resource_requests.resource_id')
    .where('event_resource_requests.event_id', eventId)
    .orderBy('event_resource_requests.created_at', 'desc');
}

/**
 * Add a resource request to an event.
 *
 * @param {object} data - { event_id, resource_id, quantity, status?, policy_exception_note? }
 * @returns {Promise<object>} The created resource request
 */
export async function addResourceRequest(data) {
  log.debug({ action: 'addResourceRequest', data }, 'Adding resource request');

  const [request] = await db('event_resource_requests')
    .insert(data)
    .returning('*');

  return request;
}

/**
 * Get budget revisions for an event ordered by revision_no.
 *
 * @param {string} eventId - Event UUID
 * @returns {Promise<object[]>}
 */
export async function getBudgetRevisions(eventId) {
  log.debug({ action: 'getBudgetRevisions', eventId }, 'Listing budget revisions');

  return db('event_budget_revisions')
    .where({ event_id: eventId })
    .orderBy('revision_no', 'asc');
}

/**
 * Add a budget revision.
 *
 * @param {object} data - { event_id, revision_no, old_budget_amount, new_budget_amount, change_percent, changed_by, approval_id? }
 * @returns {Promise<object>} The created budget revision
 */
export async function addBudgetRevision(data) {
  log.debug({ action: 'addBudgetRevision', data }, 'Adding budget revision');

  const [revision] = await db('event_budget_revisions')
    .insert(data)
    .returning('*');

  return revision;
}
