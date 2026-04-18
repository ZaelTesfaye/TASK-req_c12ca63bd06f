/**
 * Inventory Service
 *
 * Business logic for inventory snapshots, anomaly detection, gap detection,
 * and gap resolution.
 */

import { createLogger } from '../../logging/index.js';
import { writeAudit } from '../../shared/audit.js';
import { AppError, NotFoundError } from '../../shared/errors.js';
import * as inventoryRepo from './repository.js';

const log = createLogger('inventory:service');

/**
 * Scheduled job: for each active inventory item, create a snapshot with
 * the item's current quantity and unit price for today.
 *
 * @returns {Promise<{ created: number }>}
 */
export async function takeSnapshots() {
  log.info({ action: 'takeSnapshots' }, 'Taking daily inventory snapshots');

  const today = new Date().toISOString().slice(0, 10);
  const { data: items } = await inventoryRepo.findAllItems({
    page: 1,
    pageSize: 10000,
  });

  const snapshotRows = items.map((item) => ({
    item_id: item.id,
    snapshot_date: today,
    quantity: item.current_quantity,
    unit_price: item.current_unit_price,
  }));

  const created = await inventoryRepo.createManySnapshots(snapshotRows);

  log.info(
    { action: 'takeSnapshots', count: created.length },
    `Created ${created.length} snapshot(s) for ${today}`,
  );

  return { created: created.length };
}

/**
 * Detect anomalies: snapshots where quantity or price changed >20% day-over-day.
 *
 * @param {{ from: string, to: string }} dateRange
 * @returns {Promise<object[]>} Array of anomaly records
 */
export async function detectAnomalies(dateRange) {
  log.info({ action: 'detectAnomalies', dateRange }, 'Running anomaly detection');

  const anomalies = await inventoryRepo.getAnomalies(dateRange);

  log.info(
    { action: 'detectAnomalies', count: anomalies.length },
    `Found ${anomalies.length} anomaly/anomalies in date range`,
  );

  return anomalies;
}

/**
 * Detect gaps: find dates without snapshots for a specific item.
 *
 * @param {string} itemId - UUID
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {Promise<string[]>} Array of missing date strings
 */
export async function detectGaps(itemId, startDate, endDate) {
  log.info({ action: 'detectGaps', itemId, startDate, endDate }, 'Detecting snapshot gaps');

  const item = await inventoryRepo.findItemById(itemId);
  if (!item) {
    throw new NotFoundError('InventoryItem', itemId);
  }

  return inventoryRepo.getMissingDays(itemId, { from: startDate, to: endDate });
}

/**
 * Check whether reporting is blocked for a given date range because
 * unresolved gaps exist.
 *
 * @param {{ from: string, to: string }} dateRange
 * @returns {Promise<{ blocked: boolean, gaps: object[] }>}
 */
export async function checkReportingBlocked(dateRange) {
  log.debug({ action: 'checkReportingBlocked', dateRange }, 'Checking for unresolved gaps');

  const gaps = await inventoryRepo.getUnresolvedGaps(dateRange);

  return {
    blocked: gaps.length > 0,
    gaps,
  };
}

/**
 * Resolve a gap: mark a missing snapshot day as acknowledged.
 *
 * @param {string} userId - Actor user UUID
 * @param {object} gapData - { item_id, missing_date }
 * @param {string} notes - Resolution notes
 * @returns {Promise<object>} The gap resolution record
 */
export async function resolveGap(userId, gapData, notes) {
  log.info(
    { action: 'resolveGap', userId, gapData },
    'Resolving inventory gap',
  );

  const item = await inventoryRepo.findItemById(gapData.item_id);
  if (!item) {
    throw new NotFoundError('InventoryItem', gapData.item_id);
  }

  const resolution = await inventoryRepo.resolveGap({
    item_id: gapData.item_id,
    missing_date: gapData.missing_date,
    resolved_by: userId,
    notes,
  });

  await writeAudit({
    eventId: null,
    subjectType: 'inventory_gap_resolution',
    subjectId: resolution.id,
    action: 'resolve_gap',
    actorUserId: userId,
    before: null,
    after: { item_id: gapData.item_id, missing_date: gapData.missing_date, notes },
    notes: `Resolved inventory gap for item ${gapData.item_id} on ${gapData.missing_date}`,
  });

  return resolution;
}
