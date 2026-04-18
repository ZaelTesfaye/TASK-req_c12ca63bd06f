/**
 * Unit tests for overtime calculation logic in the reservations service.
 *
 * Focuses on the returnReservation function which computes overtime
 * from scheduled vs. actual end times and enforces the 30-minute threshold.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../src/db/connection.js', () => {
  const mockInsert = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 'appr-1' }]) });
  const mockDb = vi.fn().mockReturnValue({ insert: mockInsert });
  mockDb.transaction = vi.fn();
  mockDb.raw = vi.fn();
  mockDb.fn = { now: vi.fn(() => 'NOW()') };
  return { default: mockDb, db: mockDb };
});

vi.mock('../../src/logging/index.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../src/shared/audit.js', () => ({
  writeAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/modules/reservations/repository.js', () => ({
  findById: vi.fn(),
  update: vi.fn().mockResolvedValue(undefined),
  create: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

const { returnReservation } = await import('../../src/modules/reservations/service.js');
const reservationsRepo = await import('../../src/modules/reservations/repository.js');
const db = (await import('../../src/db/connection.js')).default;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SCHEDULED_END = '2026-06-15T18:00:00.000Z';

function makeReservation(overrides = {}) {
  return {
    id: 'res-1',
    event_id: 'evt-1',
    resource_id: 'resource-1',
    scheduled_start_at: '2026-06-15T10:00:00.000Z',
    scheduled_end_at: SCHEDULED_END,
    actual_start_at: '2026-06-15T10:00:00.000Z',
    status: 'occupied',
    overtime_pending_approval: false,
    created_by: 'user-1',
    ...overrides,
  };
}

// Stub the assertEventScope check by mocking db for manager_event_scopes
function stubEventScope() {
  db.mockImplementation((table) => {
    if (table === 'manager_event_scopes') {
      return {
        where: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ user_id: 'user-1', event_id: 'evt-1' }),
        }),
      };
    }
    if (table === 'approvals') {
      return {
        insert: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'appr-1' }]),
        }),
      };
    }
    return {
      where: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      }),
    };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Overtime calculation - returnReservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubEventScope();
  });

  it('overtime <= 30 minutes does not require approval', async () => {
    const reservation = makeReservation();
    reservationsRepo.findById
      .mockResolvedValueOnce(reservation)                              // loadReservation
      .mockResolvedValueOnce({ ...reservation, status: 'returned' }); // after update

    // 20 minutes overtime (within 30-min threshold)
    const actualEnd = '2026-06-15T18:20:00.000Z';

    const result = await returnReservation('user-1', 'res-1', actualEnd);

    expect(result.status).toBe('returned');
    // Should have updated with status 'returned' directly
    expect(reservationsRepo.update).toHaveBeenCalledWith('res-1', expect.objectContaining({
      status: 'returned',
      overtime_minutes: 20,
    }));
  });

  it('exactly 30 minutes of overtime does not require approval', async () => {
    const reservation = makeReservation();
    reservationsRepo.findById
      .mockResolvedValueOnce(reservation)
      .mockResolvedValueOnce({ ...reservation, status: 'returned', overtime_minutes: 30 });

    const actualEnd = '2026-06-15T18:30:00.000Z';

    const result = await returnReservation('user-1', 'res-1', actualEnd);

    expect(result.status).toBe('returned');
    expect(reservationsRepo.update).toHaveBeenCalledWith('res-1', expect.objectContaining({
      status: 'returned',
      overtime_minutes: 30,
    }));
  });

  it('overtime > 30 minutes requires justification', async () => {
    const reservation = makeReservation();
    reservationsRepo.findById.mockResolvedValueOnce(reservation);

    // 45 minutes overtime, no justification
    const actualEnd = '2026-06-15T18:45:00.000Z';

    await expect(
      returnReservation('user-1', 'res-1', actualEnd)
    ).rejects.toThrow(/overtime_justification is required/i);
  });

  it('overtime > 30 minutes with justification creates overtime approval', async () => {
    const reservation = makeReservation();
    reservationsRepo.findById
      .mockResolvedValueOnce(reservation)
      .mockResolvedValueOnce({
        ...reservation,
        overtime_minutes: 60,
        overtime_pending_approval: true,
      });

    const actualEnd = '2026-06-15T19:00:00.000Z'; // 60 minutes overtime

    const result = await returnReservation(
      'user-1',
      'res-1',
      actualEnd,
      'Client requested extended session'
    );

    // Should update with overtime_pending_approval = true
    expect(reservationsRepo.update).toHaveBeenCalledWith('res-1', expect.objectContaining({
      overtime_minutes: 60,
      overtime_pending_approval: true,
      overtime_justification: 'Client requested extended session',
    }));

    // Should create an approval record in the approvals table
    expect(db).toHaveBeenCalledWith('approvals');
  });

  it('zero overtime marks reservation as returned immediately', async () => {
    const reservation = makeReservation();
    reservationsRepo.findById
      .mockResolvedValueOnce(reservation)
      .mockResolvedValueOnce({ ...reservation, status: 'returned', overtime_minutes: 0 });

    // Returned exactly on time
    const result = await returnReservation('user-1', 'res-1', SCHEDULED_END);

    expect(result.status).toBe('returned');
    expect(reservationsRepo.update).toHaveBeenCalledWith('res-1', expect.objectContaining({
      status: 'returned',
      overtime_minutes: 0,
    }));
  });

  it('returned early (before scheduled end) has 0 overtime', async () => {
    const reservation = makeReservation();
    reservationsRepo.findById
      .mockResolvedValueOnce(reservation)
      .mockResolvedValueOnce({ ...reservation, status: 'returned', overtime_minutes: 0 });

    const actualEnd = '2026-06-15T17:30:00.000Z'; // 30 min early

    const result = await returnReservation('user-1', 'res-1', actualEnd);

    expect(result.status).toBe('returned');
    expect(reservationsRepo.update).toHaveBeenCalledWith('res-1', expect.objectContaining({
      overtime_minutes: 0,
    }));
  });

  it('rejects return if reservation is not in occupied state', async () => {
    const reservation = makeReservation({ status: 'approved' });
    reservationsRepo.findById.mockResolvedValueOnce(reservation);

    await expect(
      returnReservation('user-1', 'res-1', SCHEDULED_END)
    ).rejects.toThrow(/expected 'occupied'/i);
  });

  it('overtime > 30 min without justification throws with correct error code', async () => {
    const reservation = makeReservation();
    reservationsRepo.findById.mockResolvedValueOnce(reservation);

    const actualEnd = '2026-06-15T18:31:00.000Z'; // 31 minutes

    try {
      await returnReservation('user-1', 'res-1', actualEnd);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.code).toBe('OVERTIME_JUSTIFICATION_REQUIRED');
      expect(err.statusCode).toBe(422);
    }
  });
});
