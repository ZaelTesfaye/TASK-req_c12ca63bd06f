/**
 * Unit tests for the backup service.
 */

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockExec, tableBuilders, createQueryBuilder, mockDb } = vi.hoisted(() => {
  const mockExec = vi.fn();

  const tableBuilders = {};

  function createQueryBuilder(resolvedValue) {
    const builder = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue(resolvedValue ?? []),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
    };
    return builder;
  }

  const mockDb = vi.fn((tableName) => {
    if (tableBuilders[tableName]) return tableBuilders[tableName];
    return createQueryBuilder();
  });
  mockDb.fn = { now: vi.fn().mockReturnValue('NOW()') };

  return { mockExec, tableBuilders, createQueryBuilder, mockDb };
});

vi.mock('node:child_process', () => ({
  exec: mockExec,
}));

vi.mock('node:util', () => ({
  promisify: () => {
    return (...args) => {
      return new Promise((resolve, reject) => {
        const result = mockExec(...args);
        if (result instanceof Error) {
          reject(result);
        } else {
          resolve(result || { stdout: '', stderr: '' });
        }
      });
    };
  },
}));

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/config/index.js', () => ({
  default: {
    backup: { root: '/app/backups', retentionDays: 30 },
    databaseUrl: 'postgresql://localhost:5432/hospitality_ops',
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

vi.mock('../../src/db/connection.js', () => ({
  default: mockDb,
}));

import {
  runBackup,
  getBackupRuns,
  recordDrill,
  getRestoreTestStatus,
} from '../../src/modules/backup/service.js';

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(tableBuilders)) {
    delete tableBuilders[key];
  }
  // Default: pg_dump succeeds
  mockExec.mockReturnValue({ stdout: '', stderr: '' });
});

// ---------------------------------------------------------------------------
// runBackup
// ---------------------------------------------------------------------------

describe('runBackup', () => {
  it('executes pg_dump command', async () => {
    const runRecord = {
      id: 'b-001',
      started_at: new Date(),
      status: 'running',
      artifact_path: '2026/04/backup.sql.gz',
    };
    const completedRecord = { ...runRecord, status: 'completed', ended_at: new Date() };

    const backupBuilder = createQueryBuilder();
    backupBuilder.returning
      .mockResolvedValueOnce([runRecord])
      .mockResolvedValueOnce([completedRecord]);
    backupBuilder.where.mockReturnThis();
    tableBuilders.backup_runs = backupBuilder;

    const result = await runBackup();

    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining('pg_dump'),
      expect.objectContaining({ timeout: 300000 }),
    );
    expect(result).toEqual(completedRecord);
  });

  it('creates backup_runs record with running status', async () => {
    const runRecord = { id: 'b-002', status: 'running' };
    const completedRecord = { id: 'b-002', status: 'completed' };

    const backupBuilder = createQueryBuilder();
    backupBuilder.returning
      .mockResolvedValueOnce([runRecord])
      .mockResolvedValueOnce([completedRecord]);
    backupBuilder.where.mockReturnThis();
    tableBuilders.backup_runs = backupBuilder;

    await runBackup();

    expect(backupBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'running' }),
    );
  });

  it('records completed on success', async () => {
    const runRecord = { id: 'b-003', status: 'running' };
    const completedRecord = { id: 'b-003', status: 'completed' };

    const backupBuilder = createQueryBuilder();
    backupBuilder.returning
      .mockResolvedValueOnce([runRecord])
      .mockResolvedValueOnce([completedRecord]);
    backupBuilder.where.mockReturnThis();
    tableBuilders.backup_runs = backupBuilder;

    const result = await runBackup();

    expect(result.status).toBe('completed');
    expect(backupBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed' }),
    );
  });

  it('records failed on error', async () => {
    mockExec.mockReturnValue(new Error('pg_dump not found'));

    const runRecord = { id: 'b-004', status: 'running' };
    const failedRecord = { id: 'b-004', status: 'failed', notes: 'pg_dump not found' };

    const backupBuilder = createQueryBuilder();
    backupBuilder.returning
      .mockResolvedValueOnce([runRecord])
      .mockResolvedValueOnce([failedRecord]);
    backupBuilder.where.mockReturnThis();
    tableBuilders.backup_runs = backupBuilder;

    const result = await runBackup();

    expect(result.status).toBe('failed');
    expect(backupBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' }),
    );
  });
});

// ---------------------------------------------------------------------------
// getBackupRuns
// ---------------------------------------------------------------------------

describe('getBackupRuns', () => {
  it('returns list from DB ordered by started_at desc', async () => {
    const runs = [
      { id: 'b-1', status: 'completed', started_at: '2026-04-15' },
      { id: 'b-2', status: 'failed', started_at: '2026-04-14' },
    ];

    const backupBuilder = createQueryBuilder();
    backupBuilder.limit.mockResolvedValue(runs);
    tableBuilders.backup_runs = backupBuilder;

    const result = await getBackupRuns({ limit: 10 });

    expect(result).toEqual(runs);
    expect(backupBuilder.orderBy).toHaveBeenCalledWith('started_at', 'desc');
    expect(backupBuilder.limit).toHaveBeenCalledWith(10);
  });

  it('defaults to limit 50', async () => {
    const backupBuilder = createQueryBuilder();
    backupBuilder.limit.mockResolvedValue([]);
    tableBuilders.backup_runs = backupBuilder;

    await getBackupRuns();

    expect(backupBuilder.limit).toHaveBeenCalledWith(50);
  });
});

// ---------------------------------------------------------------------------
// recordDrill
// ---------------------------------------------------------------------------

describe('recordDrill', () => {
  it('creates a drill_run record', async () => {
    const drill = {
      id: 'd-001',
      backup_run_id: 'b-001',
      drill_quarter: '2026-Q1',
      status: 'completed',
    };

    const drillBuilder = createQueryBuilder();
    drillBuilder.returning.mockResolvedValue([drill]);
    tableBuilders.drill_runs = drillBuilder;

    const backupBuilder = createQueryBuilder();
    backupBuilder.where.mockReturnThis();
    tableBuilders.backup_runs = backupBuilder;

    const result = await recordDrill({
      backup_run_id: 'b-001',
      drill_quarter: '2026-Q1',
      executed_by: 'user-1',
    });

    expect(result).toEqual(drill);
    expect(drillBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        backup_run_id: 'b-001',
        drill_quarter: '2026-Q1',
        executed_by: 'user-1',
      }),
    );
  });

  it('marks backup as restore_tested', async () => {
    const drill = { id: 'd-002', backup_run_id: 'b-002', status: 'completed' };

    const drillBuilder = createQueryBuilder();
    drillBuilder.returning.mockResolvedValue([drill]);
    tableBuilders.drill_runs = drillBuilder;

    const backupBuilder = createQueryBuilder();
    backupBuilder.where.mockReturnThis();
    tableBuilders.backup_runs = backupBuilder;

    await recordDrill({
      backup_run_id: 'b-002',
      drill_quarter: '2026-Q2',
      executed_by: 'user-1',
    });

    expect(backupBuilder.update).toHaveBeenCalledWith({ restore_tested: true });
  });
});

// ---------------------------------------------------------------------------
// getRestoreTestStatus
// ---------------------------------------------------------------------------

describe('getRestoreTestStatus', () => {
  it('returns drill runs joined with backup info', async () => {
    const drills = [
      {
        id: 'd-1',
        backup_run_id: 'b-1',
        drill_quarter: '2026-Q1',
        backup_started_at: '2026-01-01',
        backup_status: 'completed',
        backup_artifact_path: '2026/01/backup.sql.gz',
      },
    ];

    const drillBuilder = createQueryBuilder();
    drillBuilder.limit.mockResolvedValue(drills);
    tableBuilders.drill_runs = drillBuilder;

    const result = await getRestoreTestStatus({ limit: 10 });

    expect(result).toEqual(drills);
    expect(drillBuilder.leftJoin).toHaveBeenCalledWith(
      'backup_runs',
      'backup_runs.id',
      'drill_runs.backup_run_id',
    );
  });
});
