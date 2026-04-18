/**
 * Unit tests for the event state machine logic in the events service.
 *
 * All database and external dependencies are mocked so only the
 * transition logic and its validation rules are exercised.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../src/db/connection.js', () => {
  const mockDb = vi.fn();
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

vi.mock('../../src/modules/events/repository.js', () => ({
  findById: vi.fn(),
  updateState: vi.fn(),
  getServiceWindows: vi.fn(),
  getMaterials: vi.fn(),
  getBudgetRevisions: vi.fn(),
  addBudgetRevision: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../../src/modules/approvals/repository.js', () => ({
  findByEventId: vi.fn(),
  hasPendingForEvent: vi.fn(),
}));

vi.mock('../../src/modules/approvals/service.js', () => ({
  createApproval: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are registered)
// ---------------------------------------------------------------------------

const { transitionState } = await import('../../src/modules/events/service.js');
const eventsRepo = await import('../../src/modules/events/repository.js');
const approvalsRepo = await import('../../src/modules/approvals/repository.js');
const db = (await import('../../src/db/connection.js')).default;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DRAFT_EVENT = {
  id: 'evt-1',
  title: 'Test Event',
  event_date: '2026-06-01',
  headcount: 50,
  budget_amount: 10000,
  budget_cap: 25000,
  state: 'draft',
  created_by: 'user-1',
};

function makeEvent(overrides) {
  return { ...DRAFT_EVENT, ...overrides };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Event state machine - transitionState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // draft -> submitted
  // -------------------------------------------------------------------------

  it('draft -> submitted succeeds with valid data', async () => {
    const event = makeEvent({ state: 'draft' });
    eventsRepo.findById.mockResolvedValue(event);
    eventsRepo.getServiceWindows.mockResolvedValue([{ id: 'w1' }]);
    eventsRepo.getMaterials.mockResolvedValue([{ id: 'm1' }]);
    eventsRepo.updateState.mockResolvedValue({ ...event, state: 'submitted' });

    const result = await transitionState('user-1', 'evt-1', 'submitted');

    expect(result.state).toBe('submitted');
    expect(eventsRepo.updateState).toHaveBeenCalledWith('evt-1', 'submitted', undefined);
  });

  it('draft -> submitted fails when service windows are missing', async () => {
    const event = makeEvent({ state: 'draft' });
    eventsRepo.findById.mockResolvedValue(event);
    eventsRepo.getServiceWindows.mockResolvedValue([]);
    eventsRepo.getMaterials.mockResolvedValue([{ id: 'm1' }]);

    await expect(transitionState('user-1', 'evt-1', 'submitted')).rejects.toThrow(
      'Validation failed'
    );
  });

  // -------------------------------------------------------------------------
  // draft -> approved (invalid)
  // -------------------------------------------------------------------------

  it('draft -> approved transition is rejected (invalid)', async () => {
    const event = makeEvent({ state: 'draft' });
    eventsRepo.findById.mockResolvedValue(event);

    await expect(transitionState('user-1', 'evt-1', 'approved')).rejects.toThrow(
      'Validation failed'
    );

    try {
      await transitionState('user-1', 'evt-1', 'approved');
    } catch (err) {
      expect(err.details.errors[0].message).toMatch(/Cannot transition from 'draft' to 'approved'/);
    }
  });

  // -------------------------------------------------------------------------
  // submitted -> approved
  // -------------------------------------------------------------------------

  it('submitted -> approved succeeds when no pending approvals', async () => {
    const event = makeEvent({ state: 'submitted' });
    eventsRepo.findById.mockResolvedValue(event);
    approvalsRepo.hasPendingForEvent.mockResolvedValue(false);
    eventsRepo.updateState.mockResolvedValue({ ...event, state: 'approved' });

    const result = await transitionState('user-2', 'evt-1', 'approved');

    expect(result.state).toBe('approved');
    expect(approvalsRepo.hasPendingForEvent).toHaveBeenCalledWith('evt-1');
  });

  it('submitted -> approved fails when pending approvals exist', async () => {
    const event = makeEvent({ state: 'submitted' });
    eventsRepo.findById.mockResolvedValue(event);
    approvalsRepo.hasPendingForEvent.mockResolvedValue(true);

    try {
      await transitionState('user-2', 'evt-1', 'approved');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.message).toBe('Validation failed');
      expect(err.details.errors[0].message).toMatch(/pending approvals must be resolved/);
    }
  });

  // -------------------------------------------------------------------------
  // submitted -> draft (backward transition is rejected)
  // -------------------------------------------------------------------------

  it('submitted -> draft is rejected (no backward transitions)', async () => {
    const event = makeEvent({ state: 'submitted' });
    eventsRepo.findById.mockResolvedValue(event);

    try {
      await transitionState('user-1', 'evt-1', 'draft');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.message).toBe('Validation failed');
      expect(err.details.errors[0].message).toMatch(/Cannot transition from 'submitted' to 'draft'/);
    }
  });

  // -------------------------------------------------------------------------
  // approved -> in_service
  // -------------------------------------------------------------------------

  it('approved -> in_service succeeds', async () => {
    const event = makeEvent({ state: 'approved' });
    eventsRepo.findById.mockResolvedValue(event);
    eventsRepo.updateState.mockResolvedValue({ ...event, state: 'in_service' });

    const result = await transitionState('user-1', 'evt-1', 'in_service');

    expect(result.state).toBe('in_service');
  });

  // -------------------------------------------------------------------------
  // in_service -> closed
  // -------------------------------------------------------------------------

  it('in_service -> closed succeeds when no active reservations', async () => {
    const event = makeEvent({ state: 'in_service' });
    eventsRepo.findById.mockResolvedValue(event);
    eventsRepo.updateState.mockResolvedValue({ ...event, state: 'closed' });

    // Mock the db chain for checking active reservations
    const mockFirst = vi.fn().mockResolvedValue({ count: 0 });
    const mockCount = vi.fn().mockReturnValue({ first: mockFirst });
    const mockWhereNotIn = vi.fn().mockReturnValue({ count: mockCount });
    const mockWhere = vi.fn().mockReturnValue({ whereNotIn: mockWhereNotIn });
    db.mockReturnValue({ where: mockWhere });

    const result = await transitionState('user-1', 'evt-1', 'closed');

    expect(result.state).toBe('closed');
  });

  it('in_service -> closed fails when active reservations exist', async () => {
    const event = makeEvent({ state: 'in_service' });
    eventsRepo.findById.mockResolvedValue(event);

    // Mock the db chain returning active reservation count > 0
    const mockFirst = vi.fn().mockResolvedValue({ count: 3 });
    const mockCount = vi.fn().mockReturnValue({ first: mockFirst });
    const mockWhereNotIn = vi.fn().mockReturnValue({ count: mockCount });
    const mockWhere = vi.fn().mockReturnValue({ whereNotIn: mockWhereNotIn });
    db.mockReturnValue({ where: mockWhere });

    try {
      await transitionState('user-1', 'evt-1', 'closed');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.message).toBe('Validation failed');
      expect(err.details.errors[0].message).toMatch(/Cannot close event.*active reservation/);
    }
  });

  // -------------------------------------------------------------------------
  // closed -> any state
  // -------------------------------------------------------------------------

  it('closed -> any state is rejected', async () => {
    const event = makeEvent({ state: 'closed' });
    eventsRepo.findById.mockResolvedValue(event);

    for (const target of ['draft', 'submitted', 'approved', 'in_service']) {
      try {
        await transitionState('user-1', 'evt-1', target);
        expect.fail(`Should have thrown for target '${target}'`);
      } catch (err) {
        expect(err.message).toBe('Validation failed');
        expect(err.details.errors[0].message).toMatch(/Cannot transition from 'closed'/);
      }
    }
  });

  // -------------------------------------------------------------------------
  // Non-existent event
  // -------------------------------------------------------------------------

  it('throws NotFoundError when event does not exist', async () => {
    eventsRepo.findById.mockResolvedValue(null);

    await expect(transitionState('user-1', 'evt-999', 'submitted')).rejects.toThrow(
      /not found/
    );
  });
});
