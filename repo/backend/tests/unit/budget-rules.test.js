/**
 * Unit tests for budget approval rules in the events service.
 *
 * Tests budget cap enforcement, budget_override approval lookup,
 * and the >10% change threshold that triggers budget_change approvals.
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
  update: vi.fn(),
  getBudgetRevisions: vi.fn(),
  addBudgetRevision: vi.fn(),
  updateState: vi.fn(),
  getServiceWindows: vi.fn(),
  getMaterials: vi.fn(),
  create: vi.fn(),
}));

vi.mock('../../src/modules/approvals/repository.js', () => ({
  findByEventId: vi.fn(),
  hasPendingForEvent: vi.fn(),
}));

vi.mock('../../src/modules/approvals/service.js', () => ({
  createApproval: vi.fn().mockResolvedValue({ id: 'approval-1' }),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

const { updateEvent } = await import('../../src/modules/events/service.js');
const eventsRepo = await import('../../src/modules/events/repository.js');
const approvalsRepo = await import('../../src/modules/approvals/repository.js');
const approvalsService = await import('../../src/modules/approvals/service.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_EVENT = {
  id: 'evt-1',
  title: 'Budget Test Event',
  event_date: '2026-06-01',
  headcount: 100,
  budget_amount: 20000,
  budget_cap: 25000,
  state: 'draft',
  created_by: 'user-1',
};

function makeEvent(overrides) {
  return { ...BASE_EVENT, ...overrides };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Budget rules - updateEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Budget below cap
  // -------------------------------------------------------------------------

  it('budget below cap (25000) is allowed', async () => {
    const event = makeEvent({ state: 'draft', budget_amount: 10000 });
    eventsRepo.findById.mockResolvedValue(event);
    eventsRepo.update.mockResolvedValue({ ...event, budget_amount: 20000 });

    const result = await updateEvent('user-1', 'evt-1', { budget_amount: 20000 });

    expect(result.budget_amount).toBe(20000);
    expect(eventsRepo.update).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Budget above cap without override
  // -------------------------------------------------------------------------

  it('budget above cap without override approval is rejected', async () => {
    const event = makeEvent({ state: 'draft', budget_amount: 20000, budget_cap: 25000 });
    eventsRepo.findById.mockResolvedValue(event);
    approvalsRepo.findByEventId.mockResolvedValue([]); // no overrides

    try {
      await updateEvent('user-1', 'evt-1', { budget_amount: 30000 });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.message).toBe('Validation failed');
      expect(err.details.errors[0].message).toMatch(/budget_override approval is required/i);
    }
  });

  // -------------------------------------------------------------------------
  // Budget override approval allows budget above cap
  // -------------------------------------------------------------------------

  it('budget override approval allows budget above cap', async () => {
    const event = makeEvent({ state: 'draft', budget_amount: 20000, budget_cap: 25000 });
    eventsRepo.findById.mockResolvedValue(event);
    approvalsRepo.findByEventId.mockResolvedValue([
      { approval_type: 'budget_override', status: 'approved' },
    ]);
    eventsRepo.update.mockResolvedValue({ ...event, budget_amount: 30000 });

    const result = await updateEvent('user-1', 'evt-1', { budget_amount: 30000 });

    expect(result.budget_amount).toBe(30000);
  });

  // -------------------------------------------------------------------------
  // Budget change > 10% creates approval (submitted state)
  // -------------------------------------------------------------------------

  it('budget change >10% creates budget_change approval', async () => {
    const event = makeEvent({ state: 'submitted', budget_amount: 10000, budget_cap: 25000 });
    eventsRepo.findById.mockResolvedValue(event);
    eventsRepo.getBudgetRevisions.mockResolvedValue([]);
    eventsRepo.addBudgetRevision.mockResolvedValue({});
    eventsRepo.update.mockResolvedValue({ ...event, budget_amount: 12000 });
    approvalsRepo.findByEventId.mockResolvedValue([]); // no override needed since 12000 < cap

    await updateEvent('user-1', 'evt-1', { budget_amount: 12000 });

    // 20% change (10000 -> 12000) exceeds 10% threshold
    expect(approvalsService.createApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        event_id: 'evt-1',
        approval_type: 'budget_change',
        requested_by: 'user-1',
      })
    );
    expect(eventsRepo.addBudgetRevision).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Budget change <= 10% does not create approval
  // -------------------------------------------------------------------------

  it('budget change <=10% does not create budget_change approval', async () => {
    const event = makeEvent({ state: 'submitted', budget_amount: 10000, budget_cap: 25000 });
    eventsRepo.findById.mockResolvedValue(event);
    eventsRepo.getBudgetRevisions.mockResolvedValue([]);
    eventsRepo.addBudgetRevision.mockResolvedValue({});
    eventsRepo.update.mockResolvedValue({ ...event, budget_amount: 10500 });
    approvalsRepo.findByEventId.mockResolvedValue([]);

    await updateEvent('user-1', 'evt-1', { budget_amount: 10500 });

    // 5% change (10000 -> 10500) is within 10% threshold
    expect(approvalsService.createApproval).not.toHaveBeenCalled();
    // But budget revision is still recorded
    expect(eventsRepo.addBudgetRevision).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Non-owner cannot update
  // -------------------------------------------------------------------------

  it('rejects updates from non-owner', async () => {
    const event = makeEvent({ state: 'draft', created_by: 'user-1' });
    eventsRepo.findById.mockResolvedValue(event);

    await expect(
      updateEvent('user-OTHER', 'evt-1', { budget_amount: 15000 })
    ).rejects.toThrow(/Only the event creator/);
  });

  // -------------------------------------------------------------------------
  // Cannot update in approved state
  // -------------------------------------------------------------------------

  it('rejects updates when event is in approved state', async () => {
    const event = makeEvent({ state: 'approved', created_by: 'user-1' });
    eventsRepo.findById.mockResolvedValue(event);

    await expect(
      updateEvent('user-1', 'evt-1', { budget_amount: 15000 })
    ).rejects.toThrow(/Cannot update event in 'approved' state/);
  });

  // -------------------------------------------------------------------------
  // No change in budget amount doesn't trigger threshold logic
  // -------------------------------------------------------------------------

  it('does not trigger budget rules when budget amount is unchanged', async () => {
    const event = makeEvent({ state: 'submitted', budget_amount: 10000 });
    eventsRepo.findById.mockResolvedValue(event);
    eventsRepo.update.mockResolvedValue({ ...event, title: 'Updated Title' });

    await updateEvent('user-1', 'evt-1', { title: 'Updated Title', budget_amount: 10000 });

    expect(eventsRepo.getBudgetRevisions).not.toHaveBeenCalled();
    expect(approvalsService.createApproval).not.toHaveBeenCalled();
  });
});
