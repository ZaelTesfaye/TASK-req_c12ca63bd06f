/**
 * Unit tests for the reports service.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/config/index.js', () => ({
  default: {
    upload: { root: '/app/uploads' },
  },
}));

vi.mock('../../src/shared/audit.js', () => ({
  writeAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/logging/index.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock inventoryService
const mockCheckReportingBlocked = vi.fn();

vi.mock('../../src/modules/inventory/service.js', () => ({
  checkReportingBlocked: mockCheckReportingBlocked,
}));

// DB mock
function createQueryBuilder(resolvedValue) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    whereBetween: vi.fn().mockReturnThis(),
    join: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(resolvedValue ?? []),
    orderBy: vi.fn().mockReturnThis(),
  };
  return builder;
}

const tableBuilders = {};

const mockDb = vi.fn((tableName) => {
  if (tableBuilders[tableName]) return tableBuilders[tableName];
  return createQueryBuilder();
});

vi.mock('../../src/db/connection.js', () => ({
  default: mockDb,
}));

import {
  exportInventoryReport,
  exportEventsReport,
  exportApprovalsReport,
} from '../../src/modules/reports/service.js';

import { AppError } from '../../src/shared/errors.js';

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(tableBuilders)) {
    delete tableBuilders[key];
  }
});

// ---------------------------------------------------------------------------
// exportInventoryReport
// ---------------------------------------------------------------------------

describe('exportInventoryReport', () => {
  it('blocks when unresolved gaps exist', async () => {
    mockCheckReportingBlocked.mockResolvedValue({
      blocked: true,
      gaps: [{ from: '2026-04-01', to: '2026-04-05' }],
    });

    await expect(
      exportInventoryReport('user-1', { from: '2026-04-01', to: '2026-04-30' }),
    ).rejects.toThrow('Cannot export inventory report');

    try {
      await exportInventoryReport('user-1', { from: '2026-04-01', to: '2026-04-30' });
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(409);
      expect(err.code).toBe('UNRESOLVED_GAPS');
    }
  });

  it('generates CSV when no gaps exist', async () => {
    mockCheckReportingBlocked.mockResolvedValue({ blocked: false, gaps: [] });

    const rows = [
      { item_name: 'Flour', kind: 'ingredient', unit: 'kg', snapshot_date: '2026-04-10', quantity: 50, unit_price: 2.5 },
      { item_name: 'Sugar', kind: 'ingredient', unit: 'kg', snapshot_date: '2026-04-10', quantity: 30, unit_price: 1.8 },
    ];

    const snapshotBuilder = createQueryBuilder();
    snapshotBuilder.orderBy.mockResolvedValue(rows);
    tableBuilders.inventory_snapshots = snapshotBuilder;

    const reportBuilder = createQueryBuilder();
    reportBuilder.returning.mockResolvedValue([{ id: 'r-001', report_type: 'inventory' }]);
    tableBuilders.report_exports = reportBuilder;

    const result = await exportInventoryReport('user-1', { from: '2026-04-01', to: '2026-04-30' });

    expect(result.csv).toBeDefined();
    expect(result.record).toBeDefined();
    // CSV should have headers and data rows
    const lines = result.csv.split('\n');
    expect(lines.length).toBe(3); // header + 2 data rows
    expect(lines[0]).toContain('item_name');
    expect(lines[0]).toContain('quantity');
  });

  it('export record is stored in report_exports table', async () => {
    mockCheckReportingBlocked.mockResolvedValue({ blocked: false, gaps: [] });

    const snapshotBuilder = createQueryBuilder();
    snapshotBuilder.orderBy.mockResolvedValue([
      { item_name: 'Flour', kind: 'ingredient', unit: 'kg', snapshot_date: '2026-04-10', quantity: 50, unit_price: 2.5 },
    ]);
    tableBuilders.inventory_snapshots = snapshotBuilder;

    const reportBuilder = createQueryBuilder();
    reportBuilder.returning.mockResolvedValue([{ id: 'r-001', report_type: 'inventory', file_path: 'reports/2026/04/inv.csv' }]);
    tableBuilders.report_exports = reportBuilder;

    await exportInventoryReport('user-1', { from: '2026-04-01', to: '2026-04-30' });

    expect(reportBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        report_type: 'inventory',
        created_by: 'user-1',
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// exportEventsReport
// ---------------------------------------------------------------------------

describe('exportEventsReport', () => {
  it('generates CSV of events', async () => {
    const rows = [
      {
        id: 'e-1',
        title: 'Annual Gala',
        event_date: '2026-05-01',
        headcount: 200,
        budget_amount: 50000,
        budget_cap: 60000,
        state: 'approved',
        created_by_username: 'admin',
        created_at: '2026-04-01',
      },
    ];

    const eventsBuilder = createQueryBuilder();
    eventsBuilder.orderBy.mockResolvedValue(rows);
    tableBuilders.events = eventsBuilder;

    const reportBuilder = createQueryBuilder();
    reportBuilder.returning.mockResolvedValue([{ id: 'r-002', report_type: 'events' }]);
    tableBuilders.report_exports = reportBuilder;

    const result = await exportEventsReport('user-1', {});

    expect(result.csv).toBeDefined();
    const lines = result.csv.split('\n');
    expect(lines.length).toBe(2); // header + 1 data row
    expect(lines[0]).toContain('title');
    expect(lines[0]).toContain('headcount');
    expect(lines[1]).toContain('Annual Gala');
  });

  it('applies date and state filters', async () => {
    const eventsBuilder = createQueryBuilder();
    eventsBuilder.orderBy.mockResolvedValue([]);
    tableBuilders.events = eventsBuilder;

    const reportBuilder = createQueryBuilder();
    reportBuilder.returning.mockResolvedValue([{ id: 'r-003', report_type: 'events' }]);
    tableBuilders.report_exports = reportBuilder;

    await exportEventsReport('user-1', {
      from_date: '2026-01-01',
      to_date: '2026-12-31',
      state: 'approved',
    });

    // where should be called 3 times: from_date, to_date, state
    // (leftJoin is called once, then where is chained)
    expect(eventsBuilder.where).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// exportApprovalsReport
// ---------------------------------------------------------------------------

describe('exportApprovalsReport', () => {
  it('generates CSV of approvals', async () => {
    const rows = [
      {
        id: 'a-1',
        event_title: 'Annual Gala',
        approval_type: 'budget_increase',
        status: 'approved',
        requested_by_username: 'chef',
        first_approver_username: 'manager',
        second_approver_username: 'director',
        justification: 'Increased headcount',
        old_amount: 50000,
        new_amount: 65000,
        created_at: '2026-04-01',
        decided_at: '2026-04-02',
      },
    ];

    const approvalsBuilder = createQueryBuilder();
    approvalsBuilder.orderBy.mockResolvedValue(rows);
    tableBuilders.approvals = approvalsBuilder;

    const reportBuilder = createQueryBuilder();
    reportBuilder.returning.mockResolvedValue([{ id: 'r-004', report_type: 'approvals' }]);
    tableBuilders.report_exports = reportBuilder;

    const result = await exportApprovalsReport('user-1', {});

    expect(result.csv).toBeDefined();
    const lines = result.csv.split('\n');
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain('approval_type');
    expect(lines[0]).toContain('status');
    expect(lines[1]).toContain('budget_increase');
  });

  it('CSV has proper headers matching row keys', async () => {
    const rows = [
      {
        id: 'a-2',
        event_title: 'Meeting',
        approval_type: 'headcount',
        status: 'pending',
        requested_by_username: 'planner',
        first_approver_username: null,
        second_approver_username: null,
        justification: 'More guests',
        old_amount: 100,
        new_amount: 150,
        created_at: '2026-04-05',
        decided_at: null,
      },
    ];

    const approvalsBuilder = createQueryBuilder();
    approvalsBuilder.orderBy.mockResolvedValue(rows);
    tableBuilders.approvals = approvalsBuilder;

    const reportBuilder = createQueryBuilder();
    reportBuilder.returning.mockResolvedValue([{ id: 'r-005', report_type: 'approvals' }]);
    tableBuilders.report_exports = reportBuilder;

    const result = await exportApprovalsReport('user-1', {});
    const headers = result.csv.split('\n')[0].split(',');

    expect(headers).toContain('id');
    expect(headers).toContain('event_title');
    expect(headers).toContain('approval_type');
    expect(headers).toContain('status');
    expect(headers).toContain('justification');
    expect(headers).toContain('old_amount');
    expect(headers).toContain('new_amount');
  });

  it('stores export record in report_exports table', async () => {
    const approvalsBuilder = createQueryBuilder();
    approvalsBuilder.orderBy.mockResolvedValue([]);
    tableBuilders.approvals = approvalsBuilder;

    const reportBuilder = createQueryBuilder();
    reportBuilder.returning.mockResolvedValue([{ id: 'r-006', report_type: 'approvals' }]);
    tableBuilders.report_exports = reportBuilder;

    await exportApprovalsReport('user-1', {});

    expect(reportBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        report_type: 'approvals',
        created_by: 'user-1',
      }),
    );
  });

  it('handles empty results gracefully (empty CSV)', async () => {
    const approvalsBuilder = createQueryBuilder();
    approvalsBuilder.orderBy.mockResolvedValue([]);
    tableBuilders.approvals = approvalsBuilder;

    const reportBuilder = createQueryBuilder();
    reportBuilder.returning.mockResolvedValue([{ id: 'r-007', report_type: 'approvals' }]);
    tableBuilders.report_exports = reportBuilder;

    const result = await exportApprovalsReport('user-1', {});
    expect(result.csv).toBe('');
  });
});
