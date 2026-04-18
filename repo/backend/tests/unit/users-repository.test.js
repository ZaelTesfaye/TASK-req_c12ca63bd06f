/**
 * Unit tests for the users repository.
 */

// ---------------------------------------------------------------------------
// Set up chainable mock for knex-style query builder using vi.hoisted
// ---------------------------------------------------------------------------

const { tableBuilders, createQueryBuilder, mockDb } = vi.hoisted(() => {
  const tableBuilders = {};

  function createQueryBuilder(resolvedValue) {
    const builder = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      whereIn: vi.fn().mockReturnThis(),
      join: vi.fn().mockReturnThis(),
      distinct: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
      count: vi.fn().mockReturnThis(),
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

vi.mock('../../src/db/connection.js', () => ({
  default: mockDb,
}));

vi.mock('../../src/logging/index.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import {
  findById,
  findByUsername,
  findAll,
  updateStatus,
  getUserRoles,
  getUserPermissions,
  createUser,
} from '../../src/modules/users/repository.js';
import { encrypt, decrypt } from '../../src/shared/encryption.js';

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(tableBuilders)) {
    delete tableBuilders[key];
  }
});

// ---------------------------------------------------------------------------
// findById
// ---------------------------------------------------------------------------

describe('findById', () => {
  it('returns user with roles and permissions when found', async () => {
    const userId = 'u-001';
    const userRecord = {
      id: userId,
      username: 'jdoe',
      status: 'active',
      created_at: '2025-01-01',
      updated_at: '2025-06-01',
    };

    // Setup: users table returns the user
    const usersBuilder = createQueryBuilder();
    usersBuilder.first.mockResolvedValue(userRecord);
    tableBuilders.users = usersBuilder;

    // Setup: user_roles returns roles (called twice: once for roles, once for permissions)
    const rolesBuilder = createQueryBuilder();
    rolesBuilder.select
      .mockResolvedValueOnce([{ id: 'r1', name: 'admin' }])
      .mockResolvedValueOnce([{ code: 'users:read' }, { code: 'users:write' }]);
    tableBuilders.user_roles = rolesBuilder;

    const result = await findById(userId);

    expect(result).toBeDefined();
    expect(result.id).toBe(userId);
    expect(result.username).toBe('jdoe');
    expect(result.roles).toBeDefined();
    expect(result.permissions).toBeDefined();
  });

  it('returns null for non-existent user', async () => {
    const usersBuilder = createQueryBuilder();
    usersBuilder.first.mockResolvedValue(undefined);
    tableBuilders.users = usersBuilder;

    const result = await findById('nonexistent-id');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findByUsername
// ---------------------------------------------------------------------------

describe('findByUsername', () => {
  it('returns user record when found', async () => {
    const userRecord = { id: 'u-001', username: 'admin', password_hash: 'hashed' };

    const usersBuilder = createQueryBuilder();
    usersBuilder.first.mockResolvedValue(userRecord);
    tableBuilders.users = usersBuilder;

    const result = await findByUsername('admin');

    expect(result).toEqual(userRecord);
    expect(usersBuilder.where).toHaveBeenCalledWith({ username: 'admin' });
  });

  it('returns undefined for non-existent username', async () => {
    const usersBuilder = createQueryBuilder();
    usersBuilder.first.mockResolvedValue(undefined);
    tableBuilders.users = usersBuilder;

    const result = await findByUsername('ghost');
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// findAll
// ---------------------------------------------------------------------------

describe('findAll', () => {
  it('returns paginated results with total count', async () => {
    const usersBuilder = createQueryBuilder();
    // First call: count
    usersBuilder.count.mockReturnValue(
      Promise.resolve([{ count: '42' }]),
    );
    // Chain for the data query returns users
    const users = [
      { id: 'u-1', username: 'alice', status: 'active', created_at: '2025-01-01', updated_at: '2025-06-01' },
      { id: 'u-2', username: 'bob', status: 'active', created_at: '2025-02-01', updated_at: '2025-06-01' },
    ];
    usersBuilder.offset.mockResolvedValue(users);

    // user_roles for attaching roles
    const rolesBuilder = createQueryBuilder();
    rolesBuilder.select.mockResolvedValue([
      { user_id: 'u-1', role_id: 'r1', role_name: 'admin' },
    ]);
    tableBuilders.user_roles = rolesBuilder;
    tableBuilders.users = usersBuilder;

    const result = await findAll({ page: 1, pageSize: 20 });

    expect(result.total).toBe(42);
    expect(result.data).toHaveLength(2);
    expect(result.data[0].roles).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// updateStatus
// ---------------------------------------------------------------------------

describe('updateStatus', () => {
  it('updates and returns the record', async () => {
    const updated = { id: 'u-1', username: 'alice', status: 'suspended', created_at: '2025-01-01', updated_at: '2025-07-01' };

    const usersBuilder = createQueryBuilder();
    usersBuilder.returning.mockResolvedValue([updated]);
    tableBuilders.users = usersBuilder;

    const result = await updateStatus('u-1', 'suspended');

    expect(result).toEqual(updated);
    expect(usersBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'suspended' }),
    );
  });

  it('returns null when user not found', async () => {
    const usersBuilder = createQueryBuilder();
    usersBuilder.returning.mockResolvedValue([]);
    tableBuilders.users = usersBuilder;

    const result = await updateStatus('nonexistent', 'active');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getUserRoles
// ---------------------------------------------------------------------------

describe('getUserRoles', () => {
  it('returns array of role objects', async () => {
    const roles = [
      { id: 'r1', name: 'admin' },
      { id: 'r2', name: 'editor' },
    ];

    const rolesBuilder = createQueryBuilder();
    rolesBuilder.select.mockResolvedValue(roles);
    tableBuilders.user_roles = rolesBuilder;

    const result = await getUserRoles('u-1');
    expect(result).toEqual(roles);
  });
});

// ---------------------------------------------------------------------------
// getUserPermissions
// ---------------------------------------------------------------------------

describe('getUserPermissions', () => {
  it('returns deduplicated permission codes', async () => {
    const rows = [
      { code: 'users:read' },
      { code: 'users:write' },
      { code: 'reports:view' },
    ];

    const builder = createQueryBuilder();
    builder.select.mockResolvedValue(rows);
    tableBuilders.user_roles = builder;

    const result = await getUserPermissions('u-1');
    expect(result).toEqual(['users:read', 'users:write', 'reports:view']);
  });
});

// ---------------------------------------------------------------------------
// Sensitive-field encryption (createUser / findById)
// ---------------------------------------------------------------------------

describe('sensitive field encryption', () => {
  it('createUser writes ciphertext for employee_id / phone / email to *_enc columns', async () => {
    const insertedRows = [];
    const usersBuilder = createQueryBuilder();
    usersBuilder.insert = vi.fn((payload) => {
      insertedRows.push(payload);
      return {
        returning: vi.fn().mockResolvedValue([{
          id: payload.id,
          username: payload.username,
          status: payload.status,
          employee_id_enc: payload.employee_id_enc,
          phone_number_enc: payload.phone_number_enc,
          email_enc: payload.email_enc,
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
        }]),
      };
    });
    tableBuilders.users = usersBuilder;

    const result = await createUser({
      id: 'u-42',
      username: 'alice',
      password_hash: 'hash',
      employee_id: 'EMP-12345',
      phone_number: '+15551234567',
      email: 'alice@example.com',
    });

    expect(insertedRows).toHaveLength(1);
    const row = insertedRows[0];

    // Stored values are ciphertext, NOT the original plaintext.
    expect(row.employee_id_enc).toBeTruthy();
    expect(row.employee_id_enc).not.toBe('EMP-12345');
    expect(row.phone_number_enc).not.toBe('+15551234567');
    expect(row.email_enc).not.toBe('alice@example.com');

    // Ciphertext must decrypt back to the original value (at-rest encryption).
    expect(decrypt(row.employee_id_enc)).toBe('EMP-12345');
    expect(decrypt(row.phone_number_enc)).toBe('+15551234567');
    expect(decrypt(row.email_enc)).toBe('alice@example.com');

    // API-layer response exposes masked plaintext, not raw PII.
    expect(result.employee_id).toMatch(/^\*+2345$/);
    expect(result.phone_number).toMatch(/^\*+67$/);
    expect(result.email).toMatch(/^a\*+e@example\.com$/);

    // Raw *_enc columns must never leak from read surfaces.
    expect(result).not.toHaveProperty('employee_id_enc');
    expect(result).not.toHaveProperty('phone_number_enc');
    expect(result).not.toHaveProperty('email_enc');
  });

  it('findById returns masked sensitive fields derived from stored ciphertext', async () => {
    const ciphertext = encrypt('alice@example.com');

    const userRecord = {
      id: 'u-1',
      username: 'alice',
      status: 'active',
      employee_id_enc: null,
      phone_number_enc: null,
      email_enc: ciphertext,
      created_at: '2025-01-01',
      updated_at: '2025-01-01',
    };
    const usersBuilder = createQueryBuilder();
    usersBuilder.first.mockResolvedValue(userRecord);
    tableBuilders.users = usersBuilder;

    const rolesBuilder = createQueryBuilder();
    rolesBuilder.select
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    tableBuilders.user_roles = rolesBuilder;

    const result = await findById('u-1');

    expect(result.email).toMatch(/^a\*+e@example\.com$/);
    expect(result).not.toHaveProperty('email_enc');
  });
});
