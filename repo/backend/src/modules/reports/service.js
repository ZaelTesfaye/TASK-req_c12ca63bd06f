/**
 * Reports Service
 *
 * Business logic for generating and exporting CSV reports for
 * inventory, events, and approvals data.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import db from '../../db/connection.js';
import { createLogger } from '../../logging/index.js';
import config from '../../config/index.js';
import { writeAudit } from '../../shared/audit.js';
import { AppError } from '../../shared/errors.js';
import * as inventoryService from '../inventory/service.js';

const log = createLogger('reports:service');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert an array of objects to CSV string.
 *
 * @param {object[]} rows
 * @returns {string}
 */
function toCsv(rows) {
  if (rows.length === 0) return '';

  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];

  for (const row of rows) {
    const values = headers.map((h) => {
      const val = row[h];
      if (val === null || val === undefined) return '';
      const str = String(val);
      // Escape quotes and wrap in quotes if needed
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    lines.push(values.join(','));
  }

  return lines.join('\n');
}

/**
 * Store a report export record and persist the CSV file to disk.
 *
 * @param {string} reportType
 * @param {string} csvContent
 * @param {string} userId
 * @param {string} parametersHash
 * @returns {Promise<{ filePath: string, record: object }>}
 */
async function storeReport(reportType, csvContent, userId, parametersHash) {
  const filename = `${reportType}_${Date.now()}_${randomUUID().slice(0, 8)}.csv`;
  const year = String(new Date().getFullYear());
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const relativePath = `reports/${year}/${month}/${filename}`;
  const absoluteDir = join(config.upload.root, 'reports', year, month);
  const absolutePath = join(config.upload.root, relativePath);

  await mkdir(absoluteDir, { recursive: true });
  await writeFile(absolutePath, csvContent, 'utf8');

  const [record] = await db('report_exports')
    .insert({
      report_type: reportType,
      file_path: relativePath,
      created_by: userId,
      parameters_hash: parametersHash,
    })
    .returning('*');

  return { filePath: absolutePath, relativePath, record };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Export inventory report as CSV.
 * Blocks if unresolved gaps exist in the requested date range.
 *
 * @param {string} userId
 * @param {{ from: string, to: string }} dateRange
 * @param {string} [format='csv']
 * @returns {Promise<{ csv: string, record: object }>}
 */
export async function exportInventoryReport(userId, dateRange, format = 'csv') {
  log.info(
    { action: 'exportInventoryReport', userId, dateRange, format },
    'Generating inventory report',
  );

  // Check for unresolved gaps — block export if any exist
  const gapCheck = await inventoryService.checkReportingBlocked(dateRange);
  if (gapCheck.blocked) {
    throw new AppError(
      409,
      'UNRESOLVED_GAPS',
      'Cannot export inventory report: unresolved gaps exist in the requested date range',
      { gaps: gapCheck.gaps },
    );
  }

  // Aggregate snapshot data
  const rows = await db('inventory_snapshots')
    .join('inventory_items', 'inventory_items.id', 'inventory_snapshots.item_id')
    .whereBetween('inventory_snapshots.snapshot_date', [dateRange.from, dateRange.to])
    .select(
      'inventory_items.name as item_name',
      'inventory_items.kind',
      'inventory_items.unit',
      'inventory_snapshots.snapshot_date',
      'inventory_snapshots.quantity',
      'inventory_snapshots.unit_price',
    )
    .orderBy([
      { column: 'inventory_items.name', order: 'asc' },
      { column: 'inventory_snapshots.snapshot_date', order: 'asc' },
    ]);

  const csvContent = toCsv(rows);
  const parametersHash = `inv_${dateRange.from}_${dateRange.to}`;

  const { filePath, record } = await storeReport(
    'inventory',
    csvContent,
    userId,
    parametersHash,
  );

  await writeAudit({
    eventId: null,
    subjectType: 'report_export',
    subjectId: record.id,
    action: 'export_inventory',
    actorUserId: userId,
    before: null,
    after: { dateRange, rowCount: rows.length },
    notes: `Exported inventory report (${rows.length} rows)`,
  });

  log.info(
    { action: 'exportInventoryReport', recordId: record.id, rows: rows.length },
    'Inventory report exported',
  );

  return { csv: csvContent, filePath, record };
}

/**
 * Export events report as CSV.
 *
 * @param {string} userId
 * @param {object} filters - { from_date?, to_date?, state? }
 * @returns {Promise<{ csv: string, record: object }>}
 */
export async function exportEventsReport(userId, filters = {}) {
  log.info(
    { action: 'exportEventsReport', userId, filters },
    'Generating events report',
  );

  let query = db('events')
    .leftJoin('users', 'users.id', 'events.created_by')
    .select(
      'events.id',
      'events.title',
      'events.event_date',
      'events.headcount',
      'events.budget_amount',
      'events.budget_cap',
      'events.state',
      'users.username as created_by_username',
      'events.created_at',
    );

  if (filters.from_date) {
    query = query.where('events.event_date', '>=', filters.from_date);
  }
  if (filters.to_date) {
    query = query.where('events.event_date', '<=', filters.to_date);
  }
  if (filters.state) {
    query = query.where('events.state', filters.state);
  }

  const rows = await query.orderBy('events.event_date', 'asc');

  const csvContent = toCsv(rows);
  const parametersHash = `events_${JSON.stringify(filters)}`;

  const { filePath, record } = await storeReport(
    'events',
    csvContent,
    userId,
    parametersHash,
  );

  await writeAudit({
    eventId: null,
    subjectType: 'report_export',
    subjectId: record.id,
    action: 'export_events',
    actorUserId: userId,
    before: null,
    after: { filters, rowCount: rows.length },
    notes: `Exported events report (${rows.length} rows)`,
  });

  log.info(
    { action: 'exportEventsReport', recordId: record.id, rows: rows.length },
    'Events report exported',
  );

  return { csv: csvContent, filePath, record };
}

/**
 * Export approvals report as CSV.
 *
 * @param {string} userId
 * @param {object} filters - { from_date?, to_date?, status?, approval_type? }
 * @returns {Promise<{ csv: string, record: object }>}
 */
export async function exportApprovalsReport(userId, filters = {}) {
  log.info(
    { action: 'exportApprovalsReport', userId, filters },
    'Generating approvals report',
  );

  let query = db('approvals')
    .leftJoin('events', 'events.id', 'approvals.event_id')
    .leftJoin('users as requester', 'requester.id', 'approvals.requested_by')
    .leftJoin('users as approver1', 'approver1.id', 'approvals.first_approver_id')
    .leftJoin('users as approver2', 'approver2.id', 'approvals.second_approver_id')
    .select(
      'approvals.id',
      'events.title as event_title',
      'approvals.approval_type',
      'approvals.status',
      'requester.username as requested_by_username',
      'approver1.username as first_approver_username',
      'approver2.username as second_approver_username',
      'approvals.justification',
      'approvals.old_amount',
      'approvals.new_amount',
      'approvals.created_at',
      'approvals.decided_at',
    );

  if (filters.from_date) {
    query = query.where('approvals.created_at', '>=', filters.from_date);
  }
  if (filters.to_date) {
    query = query.where('approvals.created_at', '<=', filters.to_date);
  }
  if (filters.status) {
    query = query.where('approvals.status', filters.status);
  }
  if (filters.approval_type) {
    query = query.where('approvals.approval_type', filters.approval_type);
  }

  const rows = await query.orderBy('approvals.created_at', 'asc');

  const csvContent = toCsv(rows);
  const parametersHash = `approvals_${JSON.stringify(filters)}`;

  const { filePath, record } = await storeReport(
    'approvals',
    csvContent,
    userId,
    parametersHash,
  );

  await writeAudit({
    eventId: null,
    subjectType: 'report_export',
    subjectId: record.id,
    action: 'export_approvals',
    actorUserId: userId,
    before: null,
    after: { filters, rowCount: rows.length },
    notes: `Exported approvals report (${rows.length} rows)`,
  });

  log.info(
    { action: 'exportApprovalsReport', recordId: record.id, rows: rows.length },
    'Approvals report exported',
  );

  return { csv: csvContent, filePath, record };
}
