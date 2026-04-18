/**
 * Inventory Repository
 *
 * Database access layer for inventory items, snapshots, anomalies, and gap management.
 */

import db from '../../db/connection.js';
import { createLogger } from '../../logging/index.js';
import { applyPagination } from '../../shared/pagination.js';

const log = createLogger('inventory:repository');

const ITEMS_ALLOWED_SORTS = ['name', 'kind', 'current_quantity', 'created_at', 'updated_at'];
const SNAPSHOTS_ALLOWED_SORTS = ['snapshot_date', 'quantity', 'unit_price', 'recorded_at'];

/**
 * Paginated list of inventory items with optional filters.
 *
 * @param {object} filters
 * @param {number} filters.page
 * @param {number} filters.pageSize
 * @param {string} [filters.sortBy]
 * @param {'asc'|'desc'} [filters.sortDir]
 * @param {string} [filters.kind] - Filter by item kind ('ingredient' | 'rental')
 * @param {string} [filters.search] - Search by name
 * @returns {Promise<{ data: object[], total: number }>}
 */
export async function findAllItems(filters) {
  log.debug({ action: 'findAllItems', filters }, 'Listing inventory items');

  let countQuery = db('inventory_items');
  let dataQuery = db('inventory_items').select(
    'id', 'name', 'kind', 'unit',
    'current_quantity', 'current_unit_price',
    'created_at', 'updated_at',
  );

  if (filters.kind) {
    countQuery = countQuery.where('kind', filters.kind);
    dataQuery = dataQuery.where('kind', filters.kind);
  }

  if (filters.search) {
    countQuery = countQuery.whereILike('name', `%${filters.search}%`);
    dataQuery = dataQuery.whereILike('name', `%${filters.search}%`);
  }

  const [{ count }] = await countQuery.count('id as count');
  const total = Number(count);

  const data = await applyPagination(dataQuery, {
    page: filters.page,
    pageSize: filters.pageSize,
    sortBy: filters.sortBy,
    sortDir: filters.sortDir,
    allowedSorts: ITEMS_ALLOWED_SORTS,
  });

  return { data, total };
}

/**
 * Find a single inventory item by ID.
 *
 * @param {string} id - UUID
 * @returns {Promise<object|null>}
 */
export async function findItemById(id) {
  log.debug({ action: 'findItemById', id }, 'Looking up inventory item');

  return db('inventory_items').where({ id }).first();
}

/**
 * Create a new inventory item.
 *
 * @param {object} data
 * @returns {Promise<object>} The inserted item
 */
export async function createItem(data) {
  log.info({ action: 'createItem', name: data.name }, 'Inserting inventory item');

  const [item] = await db('inventory_items')
    .insert({
      name: data.name,
      kind: data.kind,
      unit: data.unit,
      current_quantity: data.current_quantity ?? 0,
      current_unit_price: data.current_unit_price ?? 0,
    })
    .returning('*');

  return item;
}

/**
 * Update an existing inventory item.
 *
 * @param {string} id - UUID
 * @param {object} data - Fields to update
 * @returns {Promise<object|null>} Updated item or null
 */
export async function updateItem(id, data) {
  log.info({ action: 'updateItem', id }, 'Updating inventory item');

  const updatePayload = {};
  if (data.name !== undefined) updatePayload.name = data.name;
  if (data.kind !== undefined) updatePayload.kind = data.kind;
  if (data.unit !== undefined) updatePayload.unit = data.unit;
  if (data.current_quantity !== undefined) updatePayload.current_quantity = data.current_quantity;
  if (data.current_unit_price !== undefined) updatePayload.current_unit_price = data.current_unit_price;

  if (Object.keys(updatePayload).length === 0) return findItemById(id);

  updatePayload.updated_at = db.fn.now();

  const [updated] = await db('inventory_items')
    .where({ id })
    .update(updatePayload)
    .returning('*');

  return updated || null;
}

/**
 * Get snapshots for a specific item within a date range.
 *
 * @param {string} itemId - UUID
 * @param {{ from: string, to: string }} dateRange
 * @returns {Promise<object[]>}
 */
export async function getSnapshots(itemId, dateRange) {
  log.debug({ action: 'getSnapshots', itemId, dateRange }, 'Querying item snapshots');

  return db('inventory_snapshots')
    .where('item_id', itemId)
    .whereBetween('snapshot_date', [dateRange.from, dateRange.to])
    .orderBy('snapshot_date', 'asc');
}

/**
 * Paginated list of all snapshots with item info.
 *
 * @param {object} filters
 * @param {number} filters.page
 * @param {number} filters.pageSize
 * @param {string} [filters.sortBy]
 * @param {'asc'|'desc'} [filters.sortDir]
 * @param {string} [filters.item_id]
 * @param {string} [filters.from_date]
 * @param {string} [filters.to_date]
 * @returns {Promise<{ data: object[], total: number }>}
 */
export async function getAllSnapshots(filters) {
  log.debug({ action: 'getAllSnapshots', filters }, 'Listing all snapshots');

  let countQuery = db('inventory_snapshots');
  let dataQuery = db('inventory_snapshots')
    .join('inventory_items', 'inventory_items.id', 'inventory_snapshots.item_id')
    .select(
      'inventory_snapshots.id',
      'inventory_snapshots.item_id',
      'inventory_items.name as item_name',
      'inventory_items.kind as item_kind',
      'inventory_snapshots.snapshot_date',
      'inventory_snapshots.quantity',
      'inventory_snapshots.unit_price',
      'inventory_snapshots.recorded_at',
    );

  if (filters.item_id) {
    countQuery = countQuery.where('item_id', filters.item_id);
    dataQuery = dataQuery.where('inventory_snapshots.item_id', filters.item_id);
  }
  if (filters.from_date) {
    countQuery = countQuery.where('snapshot_date', '>=', filters.from_date);
    dataQuery = dataQuery.where('inventory_snapshots.snapshot_date', '>=', filters.from_date);
  }
  if (filters.to_date) {
    countQuery = countQuery.where('snapshot_date', '<=', filters.to_date);
    dataQuery = dataQuery.where('inventory_snapshots.snapshot_date', '<=', filters.to_date);
  }

  const [{ count }] = await countQuery.count('id as count');
  const total = Number(count);

  const data = await applyPagination(dataQuery, {
    page: filters.page,
    pageSize: filters.pageSize,
    sortBy: filters.sortBy,
    sortDir: filters.sortDir,
    allowedSorts: SNAPSHOTS_ALLOWED_SORTS,
  });

  return { data, total };
}

/**
 * Create a single snapshot, upserting on (item_id, snapshot_date).
 *
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function createSnapshot(data) {
  log.info(
    { action: 'createSnapshot', itemId: data.item_id, date: data.snapshot_date },
    'Upserting inventory snapshot',
  );

  const [snapshot] = await db('inventory_snapshots')
    .insert({
      item_id: data.item_id,
      snapshot_date: data.snapshot_date,
      quantity: data.quantity,
      unit_price: data.unit_price,
      recorded_at: db.fn.now(),
    })
    .onConflict(['item_id', 'snapshot_date'])
    .merge({
      quantity: data.quantity,
      unit_price: data.unit_price,
      recorded_at: db.fn.now(),
    })
    .returning('*');

  return snapshot;
}

/**
 * Bulk insert snapshots, upserting on (item_id, snapshot_date).
 *
 * @param {object[]} dataArray
 * @returns {Promise<object[]>}
 */
export async function createManySnapshots(dataArray) {
  log.info(
    { action: 'createManySnapshots', count: dataArray.length },
    'Bulk upserting inventory snapshots',
  );

  if (dataArray.length === 0) return [];

  const rows = dataArray.map((d) => ({
    item_id: d.item_id,
    snapshot_date: d.snapshot_date,
    quantity: d.quantity,
    unit_price: d.unit_price,
    recorded_at: new Date(),
  }));

  const inserted = await db('inventory_snapshots')
    .insert(rows)
    .onConflict(['item_id', 'snapshot_date'])
    .merge({
      quantity: db.raw('EXCLUDED.quantity'),
      unit_price: db.raw('EXCLUDED.unit_price'),
      recorded_at: db.raw('EXCLUDED.recorded_at'),
    })
    .returning('*');

  return inserted;
}

/**
 * Find snapshots where quantity or unit_price changed >20% day-over-day.
 *
 * @param {{ from: string, to: string }} dateRange
 * @returns {Promise<object[]>}
 */
export async function getAnomalies(dateRange) {
  log.debug({ action: 'getAnomalies', dateRange }, 'Detecting anomalies');

  const rows = await db.raw(`
    SELECT
      curr.id,
      curr.item_id,
      ii.name AS item_name,
      prev.snapshot_date AS prev_date,
      curr.snapshot_date AS curr_date,
      prev.quantity AS prev_quantity,
      curr.quantity AS curr_quantity,
      prev.unit_price AS prev_price,
      curr.unit_price AS curr_price,
      CASE WHEN prev.quantity <> 0
           THEN ABS(curr.quantity - prev.quantity) / ABS(prev.quantity)
           ELSE NULL END AS quantity_change_pct,
      CASE WHEN prev.unit_price <> 0
           THEN ABS(curr.unit_price - prev.unit_price) / ABS(prev.unit_price)
           ELSE NULL END AS price_change_pct
    FROM inventory_snapshots curr
    JOIN inventory_snapshots prev
      ON prev.item_id = curr.item_id
      AND prev.snapshot_date = curr.snapshot_date - INTERVAL '1 day'
    JOIN inventory_items ii ON ii.id = curr.item_id
    WHERE curr.snapshot_date BETWEEN ? AND ?
      AND (
        (prev.quantity <> 0 AND ABS(curr.quantity - prev.quantity) / ABS(prev.quantity) > 0.20)
        OR
        (prev.unit_price <> 0 AND ABS(curr.unit_price - prev.unit_price) / ABS(prev.unit_price) > 0.20)
      )
    ORDER BY curr.snapshot_date ASC, ii.name ASC
  `, [dateRange.from, dateRange.to]);

  return rows.rows;
}

/**
 * Find dates in a range that are missing snapshots for a given item.
 *
 * @param {string} itemId
 * @param {{ from: string, to: string }} dateRange
 * @returns {Promise<string[]>} Array of missing date strings
 */
export async function getMissingDays(itemId, dateRange) {
  log.debug({ action: 'getMissingDays', itemId, dateRange }, 'Finding missing snapshot days');

  const result = await db.raw(`
    SELECT d::date AS missing_date
    FROM generate_series(?::date, ?::date, '1 day'::interval) d
    WHERE NOT EXISTS (
      SELECT 1 FROM inventory_snapshots s
      WHERE s.item_id = ?
        AND s.snapshot_date = d::date
    )
    ORDER BY d ASC
  `, [dateRange.from, dateRange.to, itemId]);

  return result.rows.map((r) => r.missing_date);
}

/**
 * Find gaps (missing snapshot days) across all items that have not been resolved.
 *
 * @param {{ from: string, to: string }} dateRange
 * @returns {Promise<object[]>}
 */
export async function getUnresolvedGaps(dateRange) {
  log.debug({ action: 'getUnresolvedGaps', dateRange }, 'Finding unresolved gaps');

  const result = await db.raw(`
    SELECT
      ii.id AS item_id,
      ii.name AS item_name,
      d::date AS missing_date
    FROM inventory_items ii
    CROSS JOIN generate_series(?::date, ?::date, '1 day'::interval) d
    WHERE NOT EXISTS (
      SELECT 1 FROM inventory_snapshots s
      WHERE s.item_id = ii.id AND s.snapshot_date = d::date
    )
    AND NOT EXISTS (
      SELECT 1 FROM inventory_gap_resolutions g
      WHERE g.item_id = ii.id AND g.missing_date = d::date
    )
    ORDER BY d ASC, ii.name ASC
  `, [dateRange.from, dateRange.to]);

  return result.rows;
}

/**
 * Insert a gap resolution record.
 *
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function resolveGap(data) {
  log.info(
    { action: 'resolveGap', itemId: data.item_id, missingDate: data.missing_date },
    'Resolving inventory gap',
  );

  const [resolution] = await db('inventory_gap_resolutions')
    .insert({
      item_id: data.item_id,
      missing_date: data.missing_date,
      resolved_by: data.resolved_by,
      notes: data.notes || null,
    })
    .returning('*');

  return resolution;
}

/**
 * Find a gap resolution by ID.
 *
 * @param {string} id - UUID
 * @returns {Promise<object|null>}
 */
export async function findGapResolution(id) {
  log.debug({ action: 'findGapResolution', id }, 'Looking up gap resolution');

  return db('inventory_gap_resolutions').where({ id }).first();
}
