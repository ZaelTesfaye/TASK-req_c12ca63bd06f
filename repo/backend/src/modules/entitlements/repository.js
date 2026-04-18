/**
 * Entitlements Repository
 *
 * Database access layer for entitlement, redemption, bulk-import, and
 * issuance-rule operations. All functions return plain objects.
 */

import db from '../../db/connection.js';
import { createLogger } from '../../logging/index.js';

const log = createLogger('entitlements:repository');

// ---------------------------------------------------------------------------
// Entitlements
// ---------------------------------------------------------------------------

/**
 * Find an entitlement by ID, including its type info.
 *
 * @param {string} id - Entitlement UUID
 * @returns {Promise<object|null>}
 */
export async function findById(id) {
  log.debug({ action: 'findById', id }, 'Looking up entitlement by id');

  const entitlement = await db('entitlements')
    .join('entitlement_types', 'entitlement_types.id', 'entitlements.entitlement_type_id')
    .where('entitlements.id', id)
    .select(
      'entitlements.*',
      'entitlement_types.code as type_code',
      'entitlement_types.name as type_name',
      'entitlement_types.unit as type_unit',
    )
    .first();

  return entitlement || null;
}

/**
 * List entitlements for a user with optional filters.
 *
 * @param {string}  userId
 * @param {object}  filters
 * @param {number}  [filters.page]
 * @param {number}  [filters.pageSize]
 * @param {string}  [filters.event_id] - Optional event filter
 * @returns {Promise<{ data: object[], total: number }>}
 */
export async function findByUser(userId, { page = 1, pageSize = 20, event_id } = {}) {
  log.debug({ action: 'findByUser', userId, page, pageSize }, 'Listing entitlements for user');

  let baseQuery = db('entitlements')
    .join('entitlement_types', 'entitlement_types.id', 'entitlements.entitlement_type_id')
    .where('entitlements.user_id', userId);

  if (event_id) {
    baseQuery = baseQuery.where('entitlements.event_id', event_id);
  }

  const [{ count }] = await baseQuery.clone().count('entitlements.id as count');
  const total = Number(count);

  const offset = (page - 1) * pageSize;
  const data = await baseQuery
    .clone()
    .select(
      'entitlements.*',
      'entitlement_types.code as type_code',
      'entitlement_types.name as type_name',
      'entitlement_types.unit as type_unit',
    )
    .orderBy('entitlements.created_at', 'desc')
    .limit(pageSize)
    .offset(offset);

  return { data, total };
}

/**
 * List entitlements for an event.
 *
 * @param {string} eventId - Event UUID
 * @returns {Promise<object[]>}
 */
export async function findByEvent(eventId) {
  log.debug({ action: 'findByEvent', eventId }, 'Listing entitlements for event');

  return db('entitlements')
    .join('entitlement_types', 'entitlement_types.id', 'entitlements.entitlement_type_id')
    .where('entitlements.event_id', eventId)
    .select(
      'entitlements.*',
      'entitlement_types.code as type_code',
      'entitlement_types.name as type_name',
      'entitlement_types.unit as type_unit',
    )
    .orderBy('entitlements.created_at', 'desc');
}

/**
 * Create a single entitlement record.
 *
 * @param {object} data
 * @returns {Promise<object>} The inserted entitlement row
 */
export async function create(data) {
  log.debug({ action: 'create', userId: data.user_id, eventId: data.event_id }, 'Creating entitlement');

  const [entitlement] = await db('entitlements')
    .insert({
      event_id: data.event_id,
      user_id: data.user_id,
      entitlement_type_id: data.entitlement_type_id,
      quantity_total: data.quantity_total,
      quantity_remaining: data.quantity_remaining ?? data.quantity_total,
      expires_at: data.expires_at || null,
      issued_by: data.issued_by || null,
      issuance_mode: data.issuance_mode,
    })
    .returning('*');

  return entitlement;
}

/**
 * Bulk insert entitlements.
 *
 * @param {object[]} dataArray - Array of entitlement objects
 * @returns {Promise<object[]>} The inserted rows
 */
export async function createMany(dataArray) {
  log.debug({ action: 'createMany', count: dataArray.length }, 'Bulk creating entitlements');

  const rows = dataArray.map((d) => ({
    event_id: d.event_id,
    user_id: d.user_id,
    entitlement_type_id: d.entitlement_type_id,
    quantity_total: d.quantity_total,
    quantity_remaining: d.quantity_remaining ?? d.quantity_total,
    expires_at: d.expires_at || null,
    issued_by: d.issued_by || null,
    issuance_mode: d.issuance_mode,
  }));

  const inserted = await db('entitlements').insert(rows).returning('*');
  return inserted;
}

/**
 * Update the remaining quantity on an entitlement.
 *
 * @param {string} id           - Entitlement UUID
 * @param {number} newRemaining - New quantity_remaining value
 * @returns {Promise<object|null>} Updated entitlement or null
 */
export async function updateRemaining(id, newRemaining) {
  log.info({ action: 'updateRemaining', id, newRemaining }, 'Updating entitlement remaining quantity');

  const [updated] = await db('entitlements')
    .where({ id })
    .update({ quantity_remaining: newRemaining })
    .returning('*');

  return updated || null;
}

// ---------------------------------------------------------------------------
// Redemptions
// ---------------------------------------------------------------------------

/**
 * Find an existing redemption by entitlement ID and idempotency key.
 *
 * @param {string} entitlementId - Entitlement UUID
 * @param {string} idempotencyKey - Idempotency key UUID
 * @returns {Promise<object|null>}
 */
export async function findRedemptionByKey(entitlementId, idempotencyKey) {
  log.debug(
    { action: 'findRedemptionByKey', entitlementId, idempotencyKey },
    'Looking up redemption by idempotency key',
  );

  return db('redemption_records')
    .where({ entitlement_id: entitlementId, idempotency_key: idempotencyKey })
    .first() || null;
}

/**
 * Create a redemption record.
 *
 * @param {object} data
 * @returns {Promise<object>} The inserted redemption record
 */
export async function createRedemption(data) {
  log.debug({ action: 'createRedemption', entitlementId: data.entitlement_id }, 'Creating redemption record');

  const [record] = await db('redemption_records')
    .insert({
      entitlement_id: data.entitlement_id,
      event_id: data.event_id,
      user_id: data.user_id,
      quantity: data.quantity,
      idempotency_key: data.idempotency_key,
      result_status: data.result_status,
      failure_reason: data.failure_reason || null,
    })
    .returning('*');

  return record;
}

/**
 * List all redemption records for a given entitlement.
 *
 * @param {string} entitlementId - Entitlement UUID
 * @returns {Promise<object[]>}
 */
export async function findRedemptions(entitlementId) {
  log.debug({ action: 'findRedemptions', entitlementId }, 'Listing redemptions');

  return db('redemption_records')
    .where('entitlement_id', entitlementId)
    .orderBy('created_at', 'desc');
}

// ---------------------------------------------------------------------------
// Entitlement Types
// ---------------------------------------------------------------------------

/**
 * List all entitlement types.
 *
 * @returns {Promise<object[]>}
 */
export async function findTypes() {
  log.debug({ action: 'findTypes' }, 'Listing entitlement types');

  return db('entitlement_types').orderBy('name', 'asc');
}

// ---------------------------------------------------------------------------
// Issuance Rules
// ---------------------------------------------------------------------------

/**
 * List active issuance rules for a given trigger event.
 *
 * @param {string} triggerEvent - The trigger event name (e.g. 'event_approved')
 * @returns {Promise<object[]>}
 */
export async function findIssuanceRules(triggerEvent) {
  log.debug({ action: 'findIssuanceRules', triggerEvent }, 'Listing issuance rules');

  return db('entitlement_issuance_rules')
    .join('entitlement_types', 'entitlement_types.id', 'entitlement_issuance_rules.entitlement_type_id')
    .where('entitlement_issuance_rules.trigger_event', triggerEvent)
    .where('entitlement_issuance_rules.active', true)
    .select(
      'entitlement_issuance_rules.*',
      'entitlement_types.code as type_code',
      'entitlement_types.name as type_name',
    );
}

// ---------------------------------------------------------------------------
// Bulk Import Batches
// ---------------------------------------------------------------------------

/**
 * Create a bulk import batch record.
 *
 * @param {object} data
 * @returns {Promise<object>} The inserted batch row
 */
export async function createBulkBatch(data) {
  log.debug({ action: 'createBulkBatch' }, 'Creating bulk import batch');

  const [batch] = await db('bulk_import_batches')
    .insert({
      uploaded_attachment_id: data.uploaded_attachment_id || null,
      created_by: data.created_by,
      status: data.status || 'pending',
      summary_json: data.summary_json ? JSON.stringify(data.summary_json) : null,
    })
    .returning('*');

  return batch;
}

/**
 * Update a bulk import batch record.
 *
 * @param {string} id   - Batch UUID
 * @param {object} data - Fields to update
 * @returns {Promise<object|null>} Updated batch or null
 */
export async function updateBulkBatch(id, data) {
  log.info({ action: 'updateBulkBatch', id }, 'Updating bulk import batch');

  const updateData = {};
  if (data.status !== undefined) updateData.status = data.status;
  if (data.summary_json !== undefined) {
    updateData.summary_json = JSON.stringify(data.summary_json);
  }

  const [updated] = await db('bulk_import_batches')
    .where({ id })
    .update(updateData)
    .returning('*');

  return updated || null;
}
