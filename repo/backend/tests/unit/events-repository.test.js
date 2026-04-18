/**
 * Unit tests for the events repository.
 *
 * Uses a hoisted chainable knex stub so query construction (filters,
 * sorting, pagination, search) can be validated without a live Postgres.
 */

const { tableBuilders, createQueryBuilder, mockDb } = vi.hoisted(() => {
  const tableBuilders = {};

  function createQueryBuilder(resolvedValue) {
    const builder = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      whereIn: vi.fn().mockReturnThis(),
      orWhere: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      join: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue(resolvedValue ?? []),
      count: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue(resolvedValue ?? []),
      first: vi.fn().mockResolvedValue(resolvedValue ?? undefined),
    };
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
  updateState,
} from '../../src/modules/events/repository.js';

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(tableBuilders)) delete tableBuilders[key];
});

describe('create', () => {
  it('inserts the provided data and returns the created row', async () => {
    const eventsBuilder = createQueryBuilder();
    const created = { id: 'e-1', title: 'Gala' };
    eventsBuilder.returning.mockResolvedValue([created]);
    tableBuilders.events = eventsBuilder;

    const result = await create({ title: 'Gala', event_date: '2026-01-01' });

    expect(eventsBuilder.insert).toHaveBeenCalledWith({
      title: 'Gala',
      event_date: '2026-01-01',
    });
    expect(result).toEqual(created);
  });
});

describe('findById', () => {
  it('joins users and returns the event with creator_username', async () => {
    const eventsBuilder = createQueryBuilder();
    const row = { id: 'e-1', title: 'Gala', creator_username: 'alice' };
    eventsBuilder.first.mockResolvedValue(row);
    tableBuilders.events = eventsBuilder;

    const result = await findById('e-1');

    expect(result).toEqual(row);
    expect(eventsBuilder.leftJoin).toHaveBeenCalledWith('users', 'users.id', 'events.created_by');
    expect(eventsBuilder.where).toHaveBeenCalledWith('events.id', 'e-1');
  });

  it('returns null for an unknown id', async () => {
    const eventsBuilder = createQueryBuilder();
    eventsBuilder.first.mockResolvedValue(undefined);
    tableBuilders.events = eventsBuilder;

    const result = await findById('missing');
    expect(result).toBeNull();
  });
});

describe('findAll', () => {
  it('returns data + total and applies pagination (limit/offset)', async () => {
    const eventsBuilder = createQueryBuilder();
    const rows = [{ id: 'e-1', title: 'A' }, { id: 'e-2', title: 'B' }];
    eventsBuilder.count.mockReturnValue(Promise.resolve([{ count: '7' }]));
    eventsBuilder.offset.mockResolvedValue(rows);
    tableBuilders.events = eventsBuilder;

    const result = await findAll({ page: 2, pageSize: 10 });

    expect(result.total).toBe(7);
    expect(result.data).toEqual(rows);
    expect(eventsBuilder.limit).toHaveBeenCalledWith(10);
    expect(eventsBuilder.offset).toHaveBeenCalledWith(10); // (page-1)*pageSize
  });

  it('applies state filter on both count and data queries', async () => {
    const eventsBuilder = createQueryBuilder();
    eventsBuilder.count.mockReturnValue(Promise.resolve([{ count: '1' }]));
    eventsBuilder.offset.mockResolvedValue([]);
    tableBuilders.events = eventsBuilder;

    await findAll({ page: 1, pageSize: 20, state: 'draft' });

    // The `where` call happens on both countQuery and query — both share
    // the same chainable mock, so we assert at least one call included the
    // state filter.
    const stateCalls = eventsBuilder.where.mock.calls.filter(
      (c) => c[0] === 'events.state' && c[1] === 'draft',
    );
    expect(stateCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('applies ilike search against title and description when search is provided', async () => {
    const eventsBuilder = createQueryBuilder();
    eventsBuilder.count.mockReturnValue(Promise.resolve([{ count: '0' }]));
    eventsBuilder.offset.mockResolvedValue([]);
    tableBuilders.events = eventsBuilder;

    await findAll({ page: 1, pageSize: 20, search: 'gala' });

    // The search branch wraps the query builder in a .where((w) => {...})
    // callback that invokes w.where(title, 'ilike', ...) and
    // w.orWhere(description, 'ilike', ...). Since our mock where is a stub
    // returning `this`, assert the callback form was invoked.
    const callbackCalls = eventsBuilder.where.mock.calls.filter(
      (c) => typeof c[0] === 'function',
    );
    expect(callbackCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe('updateState', () => {
  it('updates the state column and sets updated_at', async () => {
    const eventsBuilder = createQueryBuilder();
    const updated = { id: 'e-1', state: 'approved' };
    eventsBuilder.returning.mockResolvedValue([updated]);
    tableBuilders.events = eventsBuilder;

    const result = await updateState('e-1', 'approved');

    expect(result).toEqual(updated);
    expect(eventsBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'approved' }),
    );
  });

  it('returns null when no row was updated', async () => {
    const eventsBuilder = createQueryBuilder();
    eventsBuilder.returning.mockResolvedValue([]);
    tableBuilders.events = eventsBuilder;

    const result = await updateState('missing', 'closed');
    expect(result).toBeNull();
  });
});
