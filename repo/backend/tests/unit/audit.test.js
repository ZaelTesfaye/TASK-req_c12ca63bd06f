/**
 * Unit tests for the audit module.
 */

const { mockInsert, logMock } = vi.hoisted(() => {
  const mockInsert = vi.fn().mockResolvedValue([{ id: 1 }]);
  const logMock = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return { mockInsert, logMock };
});

vi.mock('../../src/db/connection.js', () => {
  const fn = vi.fn(() => ({
    insert: mockInsert,
  }));
  return { default: fn };
});

vi.mock('../../src/logging/index.js', () => ({
  createLogger: () => logMock,
}));

import { writeAudit } from '../../src/shared/audit.js';
import db from '../../src/db/connection.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockInsert.mockResolvedValue([{ id: 1 }]);
});

describe('writeAudit', () => {
  const baseParams = {
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    subjectType: 'user',
    subjectId: '123',
    action: 'create',
    actorUserId: 'actor-001',
  };

  it('inserts a row into the audit_trail table', async () => {
    await writeAudit(baseParams);

    expect(db).toHaveBeenCalledWith('audit_trail');
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it('includes all required fields in the insert', async () => {
    await writeAudit({
      ...baseParams,
      before: { status: 'active' },
      after: { status: 'inactive' },
      notes: 'Status changed',
    });

    const insertArg = mockInsert.mock.calls[0][0];
    expect(insertArg.event_id).toBe(baseParams.eventId);
    expect(insertArg.subject_type).toBe('user');
    expect(insertArg.subject_id).toBe('123');
    expect(insertArg.action).toBe('create');
    expect(insertArg.actor_user_id).toBe('actor-001');
    // The DB columns are before_json / after_json (see
    // 001_initial_schema.js — jsonb columns). Test the production
    // contract, not a hypothetical one.
    expect(insertArg.before_json).toBe(JSON.stringify({ status: 'active' }));
    expect(insertArg.after_json).toBe(JSON.stringify({ status: 'inactive' }));
    expect(insertArg.notes).toBe('Status changed');
    expect(insertArg.created_at).toBeInstanceOf(Date);
  });

  it('handles null optional fields (before, after, notes)', async () => {
    await writeAudit(baseParams);

    const insertArg = mockInsert.mock.calls[0][0];
    expect(insertArg.before_json).toBeNull();
    expect(insertArg.after_json).toBeNull();
    expect(insertArg.notes).toBeNull();
  });

  it('converts subjectId to string', async () => {
    await writeAudit({ ...baseParams, subjectId: 42 });

    const insertArg = mockInsert.mock.calls[0][0];
    expect(insertArg.subject_id).toBe('42');
  });

  it('logs on success', async () => {
    await writeAudit(baseParams);

    expect(logMock.info).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'write',
        eventId: baseParams.eventId,
        subjectType: 'user',
        subjectId: '123',
      }),
      expect.stringContaining('Audit recorded'),
    );
  });

  it('logs error and re-throws on DB failure', async () => {
    const dbError = new Error('Connection refused');
    mockInsert.mockRejectedValueOnce(dbError);

    await expect(writeAudit(baseParams)).rejects.toThrow('Connection refused');

    expect(logMock.error).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'write',
        err: dbError,
        eventId: baseParams.eventId,
      }),
      expect.stringContaining('Failed to write audit trail entry'),
    );
  });

  it('eventId field is stored as-is (UUID format validated externally)', async () => {
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    await writeAudit({ ...baseParams, eventId: uuid });

    const insertArg = mockInsert.mock.calls[0][0];
    expect(insertArg.event_id).toBe(uuid);
  });

  it('serializes complex before/after objects as JSON strings', async () => {
    const before = { roles: ['admin', 'editor'], meta: { nested: true } };
    const after = { roles: ['viewer'], meta: { nested: false } };

    await writeAudit({ ...baseParams, before, after });

    const insertArg = mockInsert.mock.calls[0][0];
    expect(JSON.parse(insertArg.before_json)).toEqual(before);
    expect(JSON.parse(insertArg.after_json)).toEqual(after);
  });
});
