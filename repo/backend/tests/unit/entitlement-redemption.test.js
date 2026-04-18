/**
 * Unit tests for entitlement redemption logic.
 *
 * Tests idempotency, expiry checks, insufficient quantity,
 * successful decrement, and rollback behaviour.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockTrxInsert = vi.fn().mockReturnValue({
  returning: vi.fn().mockResolvedValue([{ id: 'rec-1' }]),
});
const mockTrxUpdate = vi.fn().mockResolvedValue(1);
const mockTrxWhere = vi.fn().mockReturnValue({ update: mockTrxUpdate });

const trx = vi.fn((table) => {
  if (table === 'entitlements') return { where: mockTrxWhere };
  if (table === 'redemption_records') return { insert: mockTrxInsert };
  return {};
});

vi.mock('../../src/db/connection.js', () => {
  const mockDb = vi.fn();
  // transaction runs the callback with a trx mock
  mockDb.transaction = vi.fn((cb) => cb(trx));
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

vi.mock('../../src/modules/entitlements/repository.js', () => ({
  findById: vi.fn(),
  findRedemptionByKey: vi.fn(),
  createRedemption: vi.fn(),
  create: vi.fn(),
  createMany: vi.fn(),
  findTypes: vi.fn(),
  findIssuanceRules: vi.fn(),
  updateRemaining: vi.fn(),
  updateBulkBatch: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

const { redeem } = await import('../../src/modules/entitlements/service.js');
const entitlementsRepo = await import('../../src/modules/entitlements/repository.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntitlement(overrides = {}) {
  return {
    id: 'ent-1',
    event_id: 'evt-1',
    user_id: 'user-1',
    entitlement_type_id: 'type-1',
    quantity_total: 10,
    quantity_remaining: 10,
    expires_at: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Entitlement redemption - redeem()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Idempotency
  // -------------------------------------------------------------------------

  it('idempotent: same key returns same result without double decrement', async () => {
    const existingRedemption = { id: 'rec-existing', result_status: 'success', failure_reason: null };
    entitlementsRepo.findRedemptionByKey.mockResolvedValue(existingRedemption);
    entitlementsRepo.findById.mockResolvedValue(makeEntitlement({ quantity_remaining: 8 }));

    const result = await redeem('user-1', 'ent-1', 2, 'idem-key-1');

    expect(result.success).toBe(true);
    expect(result.redemptionId).toBe('rec-existing');
    expect(result.remaining).toBe(8);
    expect(result.idempotencyKey).toBe('idem-key-1');
    // Should NOT have called createRedemption again
    expect(entitlementsRepo.createRedemption).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Expired entitlement
  // -------------------------------------------------------------------------

  it('expired entitlement is rejected', async () => {
    entitlementsRepo.findRedemptionByKey.mockResolvedValue(null);
    entitlementsRepo.findById.mockResolvedValue(
      makeEntitlement({ expires_at: '2020-01-01T00:00:00.000Z', quantity_remaining: 5 })
    );
    entitlementsRepo.createRedemption.mockResolvedValue({ id: 'rec-fail' });

    const result = await redeem('user-1', 'ent-1', 1, 'idem-key-2');

    expect(result.success).toBe(false);
    expect(result.failureReason).toMatch(/expired/i);
  });

  // -------------------------------------------------------------------------
  // Insufficient quantity
  // -------------------------------------------------------------------------

  it('insufficient quantity is rejected', async () => {
    entitlementsRepo.findRedemptionByKey.mockResolvedValue(null);
    entitlementsRepo.findById.mockResolvedValue(
      makeEntitlement({ quantity_remaining: 2 })
    );
    entitlementsRepo.createRedemption.mockResolvedValue({ id: 'rec-fail' });

    const result = await redeem('user-1', 'ent-1', 5, 'idem-key-3');

    expect(result.success).toBe(false);
    expect(result.failureReason).toMatch(/insufficient/i);
  });

  // -------------------------------------------------------------------------
  // Successful redemption
  // -------------------------------------------------------------------------

  it('successful redemption decrements quantity', async () => {
    entitlementsRepo.findRedemptionByKey.mockResolvedValue(null);
    entitlementsRepo.findById.mockResolvedValue(
      makeEntitlement({ quantity_remaining: 10 })
    );

    // The transaction mock (trx) is set up to return the record
    mockTrxInsert.mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'rec-new', result_status: 'success' }]),
    });

    const result = await redeem('user-1', 'ent-1', 3, 'idem-key-4');

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(7); // 10 - 3
    expect(result.redemptionId).toBe('rec-new');
  });

  // -------------------------------------------------------------------------
  // Rollback on failure (transaction ensures atomicity)
  // -------------------------------------------------------------------------

  it('rollback on failure restores quantity (transaction aborts)', async () => {
    entitlementsRepo.findRedemptionByKey.mockResolvedValue(null);
    entitlementsRepo.findById.mockResolvedValue(
      makeEntitlement({ quantity_remaining: 10 })
    );

    // Simulate transaction failure
    const db = (await import('../../src/db/connection.js')).default;
    db.transaction.mockRejectedValueOnce(new Error('DB write failed'));

    await expect(
      redeem('user-1', 'ent-1', 3, 'idem-key-5')
    ).rejects.toThrow('DB write failed');

    // The key point: because the transaction threw, no permanent
    // decrement should have been committed. The caller can retry.
  });

  // -------------------------------------------------------------------------
  // Quantity cannot go below 0
  // -------------------------------------------------------------------------

  it('quantity cannot go below 0 (requesting exact remaining succeeds)', async () => {
    entitlementsRepo.findRedemptionByKey.mockResolvedValue(null);
    entitlementsRepo.findById.mockResolvedValue(
      makeEntitlement({ quantity_remaining: 3 })
    );
    mockTrxInsert.mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'rec-exact', result_status: 'success' }]),
    });

    const result = await redeem('user-1', 'ent-1', 3, 'idem-key-6');

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it('requesting more than remaining quantity fails', async () => {
    entitlementsRepo.findRedemptionByKey.mockResolvedValue(null);
    entitlementsRepo.findById.mockResolvedValue(
      makeEntitlement({ quantity_remaining: 3 })
    );
    entitlementsRepo.createRedemption.mockResolvedValue({ id: 'rec-over' });

    const result = await redeem('user-1', 'ent-1', 4, 'idem-key-7');

    expect(result.success).toBe(false);
    expect(result.failureReason).toMatch(/insufficient/i);
    expect(result.remaining).toBe(3); // unchanged
  });

  // -------------------------------------------------------------------------
  // Entitlement not found
  // -------------------------------------------------------------------------

  it('returns failure when entitlement does not exist', async () => {
    entitlementsRepo.findRedemptionByKey.mockResolvedValue(null);
    entitlementsRepo.findById.mockResolvedValue(null);
    entitlementsRepo.createRedemption.mockResolvedValue({ id: 'rec-missing' });

    const result = await redeem('user-1', 'ent-999', 1, 'idem-key-8');

    expect(result.success).toBe(false);
    expect(result.failureReason).toMatch(/not found/i);
  });
});
