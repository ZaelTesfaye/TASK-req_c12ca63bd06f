/**
 * Entitlements Service
 *
 * Business logic layer for entitlement issuance, bulk imports,
 * and idempotent redemption processing.
 */

import { randomUUID } from 'node:crypto';
import { createLogger } from '../../logging/index.js';
import { writeAudit } from '../../shared/audit.js';
import { NotFoundError, AppError, ForbiddenError } from '../../shared/errors.js';
import db from '../../db/connection.js';
import * as entitlementsRepo from './repository.js';

const PRIVILEGED_REDEEM_PERMISSIONS = ['entitlement:issue_manual', 'admin:roles'];

function isPrivilegedCaller(userPermissions = []) {
  return PRIVILEGED_REDEEM_PERMISSIONS.some((p) => userPermissions.includes(p));
}

const log = createLogger('entitlements:service');

// ---------------------------------------------------------------------------
// Automatic Issuance
// ---------------------------------------------------------------------------

/**
 * Issue entitlements automatically upon event approval.
 *
 * Fetches active issuance rules for the 'event_approved' trigger, computes
 * quantity per the rule's formula, and creates entitlements with issuance_mode='auto'.
 *
 * The "10_per_role" formula grants 10 units per role the user holds.
 *
 * @param {string} eventId - The approved event UUID
 * @param {string} userId  - The user UUID to receive entitlements
 * @returns {Promise<object[]>} Array of created entitlements
 */
export async function issueAutomatic(eventId, userId) {
  log.info({ action: 'issueAutomatic', eventId, userId }, 'Issuing automatic entitlements');

  // Fetch active rules for 'event_approved'
  const rules = await entitlementsRepo.findIssuanceRules('event_approved');

  if (rules.length === 0) {
    log.info({ action: 'issueAutomatic', eventId }, 'No active issuance rules found');
    return [];
  }

  // Fetch user's roles to compute quantities
  const userRoles = await db('user_roles').where('user_id', userId);
  const roleCount = userRoles.length;

  const created = [];

  for (const rule of rules) {
    // Compute quantity based on formula
    let quantity;
    if (rule.quantity_formula === '10_per_role') {
      quantity = 10 * roleCount;
    } else {
      // Fallback: try parsing formula as a plain number
      const parsed = Number(rule.quantity_formula);
      quantity = Number.isFinite(parsed) ? parsed : 0;
    }

    if (quantity <= 0) {
      log.warn(
        { action: 'issueAutomatic', ruleId: rule.id, formula: rule.quantity_formula },
        'Computed quantity is zero or negative, skipping',
      );
      continue;
    }

    const entitlement = await entitlementsRepo.create({
      event_id: eventId,
      user_id: userId,
      entitlement_type_id: rule.entitlement_type_id,
      quantity_total: quantity,
      quantity_remaining: quantity,
      issuance_mode: 'auto',
    });

    created.push(entitlement);

    // Write audit trail
    await writeAudit({
      eventId: eventId,
      subjectType: 'entitlement',
      subjectId: entitlement.id,
      action: 'auto_issue',
      actorUserId: userId,
      before: null,
      after: {
        entitlementId: entitlement.id,
        ruleId: rule.id,
        formula: rule.quantity_formula,
        computedQuantity: quantity,
        roleCount,
      },
      notes: `Auto-issued ${quantity} units of '${rule.type_code}' via rule '${rule.name}'`,
    });
  }

  return created;
}

// ---------------------------------------------------------------------------
// Manual Issuance
// ---------------------------------------------------------------------------

/**
 * Issue a single entitlement manually.
 *
 * @param {string} issuerId - The issuing user's UUID
 * @param {object} data
 * @param {string} data.event_id
 * @param {string} data.user_id
 * @param {string} data.entitlement_type_id
 * @param {number} data.quantity_total
 * @param {string} [data.expires_at]
 * @returns {Promise<object>} The created entitlement
 */
export async function issueManual(issuerId, data) {
  log.info(
    { action: 'issueManual', issuerId, userId: data.user_id, eventId: data.event_id },
    'Issuing manual entitlement',
  );

  const entitlement = await entitlementsRepo.create({
    event_id: data.event_id,
    user_id: data.user_id,
    entitlement_type_id: data.entitlement_type_id,
    quantity_total: data.quantity_total,
    quantity_remaining: data.quantity_total,
    expires_at: data.expires_at || null,
    issued_by: issuerId,
    issuance_mode: 'manual',
  });

  // Write audit trail
  await writeAudit({
    eventId: data.event_id,
    subjectType: 'entitlement',
    subjectId: entitlement.id,
    action: 'manual_issue',
    actorUserId: issuerId,
    before: null,
    after: {
      entitlementId: entitlement.id,
      eventId: data.event_id,
      userId: data.user_id,
      quantityTotal: data.quantity_total,
    },
    notes: `Manually issued ${data.quantity_total} units to user ${data.user_id} for event ${data.event_id}`,
  });

  return entitlement;
}

// ---------------------------------------------------------------------------
// Bulk Import
// ---------------------------------------------------------------------------

/**
 * Validate a bulk import CSV file.
 *
 * Expected CSV columns: event_id, user_id, entitlement_type, quantity, expiry_date
 * Validates each row and returns valid rows, errors, and a summary.
 *
 * @param {string} csvContent - Raw CSV text
 * @returns {Promise<{ valid: object[], errors: object[], summary: object }>}
 */
export async function validateBulkImport(csvContent) {
  log.info({ action: 'validateBulkImport' }, 'Validating bulk import CSV');

  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) {
    return {
      valid: [],
      errors: [{ row: 0, message: 'CSV must contain a header row and at least one data row' }],
      summary: { totalRows: 0, validCount: 0, errorCount: 1 },
    };
  }

  // Parse header
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const expectedColumns = ['event_id', 'user_id', 'entitlement_type', 'quantity', 'expiry_date'];

  const missingColumns = expectedColumns.filter((col) => !header.includes(col));
  if (missingColumns.length > 0) {
    return {
      valid: [],
      errors: [{ row: 0, message: `Missing required columns: ${missingColumns.join(', ')}` }],
      summary: { totalRows: 0, validCount: 0, errorCount: 1 },
    };
  }

  // Build column index map
  const colIdx = {};
  for (const col of expectedColumns) {
    colIdx[col] = header.indexOf(col);
  }

  // Preload entitlement types for validation
  const types = await entitlementsRepo.findTypes();
  const typeByCode = {};
  for (const t of types) {
    typeByCode[t.code] = t;
  }

  const valid = [];
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(',').map((c) => c.trim());
    const rowNum = i + 1; // 1-based, accounting for header

    const eventId = cols[colIdx.event_id];
    const userId = cols[colIdx.user_id];
    const entitlementType = cols[colIdx.entitlement_type];
    const quantityStr = cols[colIdx.quantity];
    const expiryDate = cols[colIdx.expiry_date] || null;

    const rowErrors = [];

    // Validate event_id is a UUID-like string
    if (!eventId || eventId.length < 10) {
      rowErrors.push('Invalid event_id');
    }

    // Validate user_id
    if (!userId || userId.length < 10) {
      rowErrors.push('Invalid user_id');
    }

    // Validate entitlement type exists
    if (!entitlementType || !typeByCode[entitlementType]) {
      rowErrors.push(`Unknown entitlement_type: '${entitlementType}'`);
    }

    // Validate quantity
    const quantity = Number(quantityStr);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      rowErrors.push(`Invalid quantity: '${quantityStr}'`);
    }

    // Validate expiry_date if provided
    if (expiryDate && expiryDate !== '') {
      const parsed = new Date(expiryDate);
      if (isNaN(parsed.getTime())) {
        rowErrors.push(`Invalid expiry_date: '${expiryDate}'`);
      }
    }

    if (rowErrors.length > 0) {
      errors.push({ row: rowNum, message: rowErrors.join('; ') });
    } else {
      valid.push({
        event_id: eventId,
        user_id: userId,
        entitlement_type_id: typeByCode[entitlementType].id,
        entitlement_type_code: entitlementType,
        quantity_total: quantity,
        expires_at: expiryDate || null,
      });
    }
  }

  const summary = {
    totalRows: lines.length - 1,
    validCount: valid.length,
    errorCount: errors.length,
  };

  return { valid, errors, summary };
}

/**
 * Confirm a validated bulk import batch.
 * Creates entitlements from the stored validated data.
 *
 * @param {string} userId  - The confirming user's UUID
 * @param {string} batchId - The batch UUID to confirm
 * @returns {Promise<{ entitlements: object[], batch: object }>}
 */
export async function confirmBulkImport(userId, batchId) {
  log.info({ action: 'confirmBulkImport', userId, batchId }, 'Confirming bulk import');

  // Fetch the batch
  const batch = await db('bulk_import_batches').where({ id: batchId }).first();
  if (!batch) {
    throw new NotFoundError('BulkImportBatch', batchId);
  }

  if (batch.status !== 'pending') {
    throw new AppError(
      422,
      'INVALID_BATCH_STATUS',
      `Batch status is '${batch.status}'; must be 'pending' to confirm`,
    );
  }

  // Parse the summary to get validated rows
  const summary = typeof batch.summary_json === 'string'
    ? JSON.parse(batch.summary_json)
    : batch.summary_json;

  if (!summary || !summary.validRows || summary.validRows.length === 0) {
    throw new AppError(422, 'EMPTY_BATCH', 'Batch has no valid rows to import');
  }

  // Create entitlements from valid rows
  const entitlementData = summary.validRows.map((row) => ({
    event_id: row.event_id,
    user_id: row.user_id,
    entitlement_type_id: row.entitlement_type_id,
    quantity_total: row.quantity_total,
    quantity_remaining: row.quantity_total,
    expires_at: row.expires_at || null,
    issued_by: userId,
    issuance_mode: 'bulk_import',
  }));

  const entitlements = await entitlementsRepo.createMany(entitlementData);

  // Update batch status to confirmed
  const updatedBatch = await entitlementsRepo.updateBulkBatch(batchId, {
    status: 'confirmed',
  });

  // Write audit trail
  await writeAudit({
    eventId: null,
    subjectType: 'bulk_import_batch',
    subjectId: batchId,
    action: 'confirm_bulk_import',
    actorUserId: userId,
    before: { status: 'pending' },
    after: { status: 'confirmed', entitlementCount: entitlements.length },
    notes: `Confirmed bulk import batch with ${entitlements.length} entitlements`,
  });

  return { entitlements, batch: updatedBatch };
}

// ---------------------------------------------------------------------------
// Redemption
// ---------------------------------------------------------------------------

/**
 * Redeem an entitlement (idempotent).
 *
 * 1. If idempotencyKey provided, check for existing redemption with that key.
 * 2. If found, return the prior result (no double decrement).
 * 3. If not found, validate entitlement exists, not expired, sufficient remaining.
 * 4. In a transaction: decrement quantity_remaining, create redemption record.
 * 5. If any check fails, create redemption record with failure status and reason.
 * 6. Write audit trail.
 * 7. Return structured result.
 *
 * @param {string} userId         - The redeeming user's UUID
 * @param {string} entitlementId  - Entitlement UUID
 * @param {number} quantity       - Quantity to redeem
 * @param {string} idempotencyKey - Idempotency key UUID
 * @param {string[]} [userPermissions=[]] - Caller's permissions; privileged roles may redeem on behalf of others.
 * @returns {Promise<{ success: boolean, redemptionId: string, remaining: number, idempotencyKey: string, failureReason?: string }>}
 */
export async function redeem(userId, entitlementId, quantity, idempotencyKey, userPermissions = []) {
  log.info(
    { action: 'redeem', userId, entitlementId, quantity, idempotencyKey },
    'Processing entitlement redemption',
  );

  // Defense in depth: even if the route is misconfigured, verify the caller
  // owns the entitlement or holds a privileged permission before any state
  // mutation. Skip this if the entitlement doesn't exist — the standard
  // not-found path below records a failed redemption for observability.
  const ownershipCheckEntitlement = await entitlementsRepo.findById(entitlementId);
  if (ownershipCheckEntitlement) {
    const isOwner = ownershipCheckEntitlement.user_id === userId;
    if (!isOwner && !isPrivilegedCaller(userPermissions)) {
      throw new ForbiddenError('You can only redeem your own entitlements');
    }
  }

  // 1. Check for existing redemption with this idempotency key
  const existing = await entitlementsRepo.findRedemptionByKey(entitlementId, idempotencyKey);
  if (existing) {
    log.info(
      { action: 'redeem', redemptionId: existing.id, idempotencyKey },
      'Returning existing redemption (idempotent)',
    );
    // Fetch current remaining for the response
    const currentEntitlement = await entitlementsRepo.findById(entitlementId);
    return {
      success: existing.result_status === 'success',
      redemptionId: existing.id,
      remaining: currentEntitlement ? Number(currentEntitlement.quantity_remaining) : 0,
      idempotencyKey,
      failureReason: existing.failure_reason || undefined,
    };
  }

  // 2. Validate entitlement
  //
  // redemption_records.entitlement_id and .event_id are both NOT NULL FK
  // columns (see 001_initial_schema.js:478–482). We previously attempted to
  // write a failure row with a zero-UUID placeholder for both columns,
  // which triggered an FK violation and a 500 on what should be a clean
  // 404. Instead, log the failed attempt and surface a structured not-found
  // error so the route can respond with 404 consistently.
  const entitlement = await entitlementsRepo.findById(entitlementId);

  if (!entitlement) {
    log.warn(
      { action: 'redeem', entitlementId, userId, idempotencyKey },
      'Redemption attempted on nonexistent entitlement',
    );
    throw new NotFoundError('Entitlement', entitlementId);
  }

  // Check expiry
  if (entitlement.expires_at && new Date(entitlement.expires_at) < new Date()) {
    const failRecord = await entitlementsRepo.createRedemption({
      entitlement_id: entitlementId,
      event_id: entitlement.event_id,
      user_id: userId,
      quantity,
      idempotency_key: idempotencyKey,
      result_status: 'failure',
      failure_reason: 'Entitlement has expired',
    });

    await writeAudit({
      eventId: entitlement.event_id,
      subjectType: 'redemption',
      subjectId: failRecord.id,
      action: 'redeem_failed',
      actorUserId: userId,
      before: null,
      after: { reason: 'expired', entitlementId },
      notes: 'Redemption failed: entitlement has expired',
    });

    return {
      success: false,
      redemptionId: failRecord.id,
      remaining: Number(entitlement.quantity_remaining),
      idempotencyKey,
      failureReason: 'Entitlement has expired',
    };
  }

  // Check quantity remaining
  const currentRemaining = Number(entitlement.quantity_remaining);
  if (currentRemaining < quantity) {
    const failRecord = await entitlementsRepo.createRedemption({
      entitlement_id: entitlementId,
      event_id: entitlement.event_id,
      user_id: userId,
      quantity,
      idempotency_key: idempotencyKey,
      result_status: 'failure',
      failure_reason: `Insufficient remaining quantity (requested: ${quantity}, available: ${currentRemaining})`,
    });

    await writeAudit({
      eventId: entitlement.event_id,
      subjectType: 'redemption',
      subjectId: failRecord.id,
      action: 'redeem_failed',
      actorUserId: userId,
      before: null,
      after: { reason: 'insufficient_quantity', requested: quantity, available: currentRemaining },
      notes: `Redemption failed: insufficient quantity (requested ${quantity}, available ${currentRemaining})`,
    });

    return {
      success: false,
      redemptionId: failRecord.id,
      remaining: currentRemaining,
      idempotencyKey,
      failureReason: `Insufficient remaining quantity (requested: ${quantity}, available: ${currentRemaining})`,
    };
  }

  // 3. Execute redemption in a transaction
  const result = await db.transaction(async (trx) => {
    // Decrement quantity_remaining
    const newRemaining = currentRemaining - quantity;
    await trx('entitlements')
      .where({ id: entitlementId })
      .update({ quantity_remaining: newRemaining });

    // Create redemption record
    const [record] = await trx('redemption_records')
      .insert({
        entitlement_id: entitlementId,
        event_id: entitlement.event_id,
        user_id: userId,
        quantity,
        idempotency_key: idempotencyKey,
        result_status: 'success',
        failure_reason: null,
      })
      .returning('*');

    return { record, newRemaining };
  });

  // 4. Write audit trail
  await writeAudit({
    eventId: entitlement.event_id,
    subjectType: 'redemption',
    subjectId: result.record.id,
    action: 'redeem_success',
    actorUserId: userId,
    before: { quantityRemaining: currentRemaining },
    after: { quantityRemaining: result.newRemaining, quantityRedeemed: quantity },
    notes: `Redeemed ${quantity} units from entitlement ${entitlementId}`,
  });

  return {
    success: true,
    redemptionId: result.record.id,
    remaining: result.newRemaining,
    idempotencyKey,
  };
}
