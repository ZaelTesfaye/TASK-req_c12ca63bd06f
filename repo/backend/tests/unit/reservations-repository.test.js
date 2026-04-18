/**
 * Unit tests for the reservations repository.
 *
 * Focuses on scope filter correctness and pagination total calculation.
 */

const { tableBuilders, createQueryBuilder, mockDb } = vi.hoisted(() => {
  const tableBuilders = {};

  function createQueryBuilder(resolvedValue) {
    const builder = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      whereIn: vi.fn().mockReturnThis(),
      orWhere: vi.fn().mockReturnThis(),
      orWhereIn: vi.fn().mockReturnThis(),
      whereNotIn: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      join: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
      count: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue(resolvedValue ?? []),
      first: vi.fn().mockResolvedValue(resolvedValue ?? undefined),
      clone: vi.fn(),
      then: undefined,
    };
    builder.clone.mockImplementation(() => builder);
    return builder;
  }

  const mockDb = vi.fn((tableName) => {
    if (tableBuilders[tableName]) return tableBuilders[tableName];
    return createQueryBuilder();
  });
  mockDb.fn = { now: vi.fn().mockReturnValue('NOW()') };

  return { tableBuilders, createQueryBuilder, mockDb };
});

vi.mock('../../src/db/connection.js', () => ({ default: mockDb }));
vi.mock('../../src/logging/index.js', () => ({
  createLogger: () => ({
    info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(),
  }),
}));

import {
  create,
  findById,
  findAll,
  hasActiveForEvent,
} from '../../src/modules/reservations/repository.js';

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(tableBuilders)) delete tableBuilders[key];
});

describe('create', () => {
  it('defaults status to "requested" when not provided', async () => {
    const builder = createQueryBuilder();
    const created = { id: 'r-1', status: 'requested' };
    builder.returning.mockResolvedValue([created]);
    tableBuilders.reservations = builder;

    const result = await create({
      event_id: 'e-1',
      resource_id: 'res-1',
      scheduled_start_at: '2026-01-01T10:00Z',
      scheduled_end_at: '2026-01-01T11:00Z',
      created_by: 'u-1',
    });

    expect(result).toEqual(created);
    const insertArg = builder.insert.mock.calls[0][0];
    expect(insertArg.status).toBe('requested');
  });
});

describe('findById', () => {
  it('returns null when not found', async () => {
    const builder = createQueryBuilder();
    builder.first.mockResolvedValue(undefined);
    tableBuilders.reservations = builder;

    const result = await findById('missing');
    expect(result).toBeNull();
  });
});

describe('findAll', () => {
  it('returns data + total and applies pagination via applyPagination', async () => {
    const builder = createQueryBuilder();
    const rows = [{ id: 'r-1' }, { id: 'r-2' }];

    // count() returns a chainable with `then` -> [{ count }]
    builder.count.mockReturnValue(Promise.resolve([{ count: '5' }]));

    // Paginated data query resolves when awaited
    builder.offset.mockReturnValue(Promise.resolve(rows));

    tableBuilders.reservations = builder;

    const result = await findAll({ page: 1, pageSize: 10 });

    expect(result.total).toBe(5);
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('applies scope filter (user + scopedEventIds) so count reflects visible rows', async () => {
    const builder = createQueryBuilder();
    builder.count.mockReturnValue(Promise.resolve([{ count: '2' }]));
    builder.offset.mockReturnValue(Promise.resolve([]));
    tableBuilders.reservations = builder;

    await findAll({
      page: 1,
      pageSize: 20,
      scope: { userId: 'u-1', scopedEventIds: ['e-1', 'e-2'] },
    });

    // The scope branch wraps the builder in a callback (.where(qb => ...)).
    const callbackCalls = builder.where.mock.calls.filter(
      (c) => typeof c[0] === 'function',
    );
    expect(callbackCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('applies scope filter with an empty scopedEventIds (creator-only visibility)', async () => {
    const builder = createQueryBuilder();
    builder.count.mockReturnValue(Promise.resolve([{ count: '0' }]));
    builder.offset.mockReturnValue(Promise.resolve([]));
    tableBuilders.reservations = builder;

    await findAll({
      page: 1,
      pageSize: 20,
      scope: { userId: 'u-1', scopedEventIds: [] },
    });

    const callbackCalls = builder.where.mock.calls.filter(
      (c) => typeof c[0] === 'function',
    );
    expect(callbackCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe('hasActiveForEvent', () => {
  it('returns true when an active reservation exists', async () => {
    const builder = createQueryBuilder();
    builder.first.mockResolvedValue({ id: 'r-1' });
    tableBuilders.reservations = builder;

    const result = await hasActiveForEvent('e-1');
    expect(result).toBe(true);
  });

  it('returns false when none exist', async () => {
    const builder = createQueryBuilder();
    builder.first.mockResolvedValue(undefined);
    tableBuilders.reservations = builder;

    const result = await hasActiveForEvent('e-1');
    expect(result).toBe(false);
  });
});
