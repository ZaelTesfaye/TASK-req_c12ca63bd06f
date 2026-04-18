/**
 * Unit tests for the resources / catalog repository.
 *
 * Covers tree assembly, metadata validation, and basic CRUD query shape.
 */

const { tableBuilders, createQueryBuilder, mockDb } = vi.hoisted(() => {
  const tableBuilders = {};

  function createQueryBuilder(resolvedValue) {
    const builder = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      whereIn: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      join: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(resolvedValue ?? []),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue(resolvedValue ?? []),
      count: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      del: vi.fn().mockResolvedValue(0),
      returning: vi.fn().mockResolvedValue(resolvedValue ?? []),
      first: vi.fn().mockResolvedValue(resolvedValue ?? undefined),
      clone: vi.fn(),
    };
    builder.clone.mockImplementation(() => builder);
    return builder;
  }

  const mockDb = vi.fn((tableName) => {
    if (tableBuilders[tableName]) return tableBuilders[tableName];
    return createQueryBuilder();
  });
  mockDb.raw = vi.fn((s) => s);
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
  getTree,
  validateMetadata,
  create,
} from '../../src/modules/resources/repository.js';

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(tableBuilders)) delete tableBuilders[key];
});

describe('getTree', () => {
  it('assembles roots and nests children under matching parents', async () => {
    const resourcesBuilder = createQueryBuilder();
    const rows = [
      { id: 'a', parent_id: null, name: 'Root A', status: 'published' },
      { id: 'b', parent_id: 'a', name: 'Child B', status: 'published' },
      { id: 'c', parent_id: null, name: 'Root C', status: 'published' },
    ];
    resourcesBuilder.orderBy.mockResolvedValue(rows);
    tableBuilders.resources = resourcesBuilder;

    const tree = await getTree();

    expect(tree).toHaveLength(2);
    const rootA = tree.find((n) => n.id === 'a');
    const rootC = tree.find((n) => n.id === 'c');
    expect(rootA).toBeDefined();
    expect(rootC).toBeDefined();
    expect(rootA.children).toHaveLength(1);
    expect(rootA.children[0].id).toBe('b');
    expect(rootC.children).toHaveLength(0);
  });

  it('promotes orphans (parent_id references missing) to root-level nodes', async () => {
    const resourcesBuilder = createQueryBuilder();
    const rows = [
      { id: 'x', parent_id: 'missing', name: 'Orphan', status: 'published' },
    ];
    resourcesBuilder.orderBy.mockResolvedValue(rows);
    tableBuilders.resources = resourcesBuilder;

    const tree = await getTree();

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('x');
    expect(tree[0].children).toEqual([]);
  });
});

describe('validateMetadata', () => {
  it('reports missing required fields', () => {
    const template = {
      required_fields_json: ['serial', 'asset_tag'],
      validation_rules_json: {},
    };
    const { valid, errors } = validateMetadata({ serial: '123' }, template);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('asset_tag'))).toBe(true);
  });

  it('enforces type rules', () => {
    const template = {
      required_fields_json: [],
      validation_rules_json: { capacity: { type: 'number' } },
    };
    const { valid, errors } = validateMetadata({ capacity: 'lots' }, template);
    expect(valid).toBe(false);
    expect(errors[0]).toMatch(/capacity/);
  });

  it('enforces min/max and pattern rules', () => {
    const template = {
      required_fields_json: [],
      validation_rules_json: {
        capacity: { type: 'number', min: 1, max: 100 },
        code: { type: 'string', pattern: '^[A-Z]{3}$' },
      },
    };
    const badMin = validateMetadata({ capacity: 0, code: 'ABC' }, template);
    expect(badMin.valid).toBe(false);
    const badPattern = validateMetadata({ capacity: 50, code: 'abc' }, template);
    expect(badPattern.valid).toBe(false);
    const ok = validateMetadata({ capacity: 50, code: 'ABC' }, template);
    expect(ok.valid).toBe(true);
  });

  it('parses JSON-string forms of required_fields_json / validation_rules_json', () => {
    const template = {
      required_fields_json: JSON.stringify(['serial']),
      validation_rules_json: JSON.stringify({ serial: { type: 'string' } }),
    };
    const { valid } = validateMetadata({ serial: 'S-1' }, template);
    expect(valid).toBe(true);
  });
});

describe('create', () => {
  it('defaults missing fields and serializes metadata_json', async () => {
    const builder = createQueryBuilder();
    builder.returning.mockResolvedValue([{ id: 'r-1', name: 'Thing' }]);
    tableBuilders.resources = builder;

    await create({ name: 'Thing', resource_type: 'equipment', metadata_json: { foo: 'bar' } });

    const inserted = builder.insert.mock.calls[0][0];
    expect(inserted.name).toBe('Thing');
    expect(inserted.resource_type).toBe('equipment');
    expect(inserted.status).toBe('draft');
    expect(inserted.version).toBe(1);
    expect(JSON.parse(inserted.metadata_json)).toEqual({ foo: 'bar' });
  });
});
