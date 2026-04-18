/**
 * Unit tests for the data collection service.
 */

// ---------------------------------------------------------------------------
// Mock DB (knex-style chainable) using vi.hoisted
// ---------------------------------------------------------------------------

const { tableBuilders, createQueryBuilder, mockDb } = vi.hoisted(() => {
  const tableBuilders = {};

  function createQueryBuilder(resolvedValue) {
    const builder = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      count: vi.fn(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue(resolvedValue ?? []),
      first: vi.fn().mockResolvedValue(resolvedValue ?? undefined),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
    };
    return builder;
  }

  const mockDb = vi.fn((tableName) => {
    if (tableBuilders[tableName]) return tableBuilders[tableName];
    return createQueryBuilder();
  });
  mockDb.raw = vi.fn().mockResolvedValue(true);
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

vi.mock('../../src/shared/audit.js', () => ({
  writeAudit: vi.fn().mockResolvedValue(undefined),
}));

import {
  healthCheck,
  createJob,
  requeueJob,
  gracefulDegradation,
  getProxyPool,
  getUserAgentPool,
  cookieStore,
  captchaPlugin,
} from '../../src/modules/data-collection/service.js';

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(tableBuilders)) {
    delete tableBuilders[key];
  }
});

// ---------------------------------------------------------------------------
// healthCheck
// ---------------------------------------------------------------------------

describe('healthCheck', () => {
  it('returns subsystem status including DB, proxies, and job counts', async () => {
    const dcBuilder = createQueryBuilder();
    dcBuilder.count
      .mockResolvedValueOnce([{ pending_count: '5' }])
      .mockResolvedValueOnce([{ failed_count: '2' }]);
    dcBuilder.where.mockImplementation(() => ({
      count: dcBuilder.count,
    }));
    tableBuilders.data_collection_jobs = dcBuilder;

    const result = await healthCheck();

    expect(result).toHaveProperty('dbHealthy');
    expect(result).toHaveProperty('healthy');
    expect(result).toHaveProperty('unhealthy');
    expect(result).toHaveProperty('proxies');
    expect(result).toHaveProperty('pendingJobs');
    expect(result).toHaveProperty('failedJobs');
    expect(result).toHaveProperty('cookieSources');
    expect(result).toHaveProperty('userAgentPoolSize');
    expect(result.healthy).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// createJob
// ---------------------------------------------------------------------------

describe('createJob', () => {
  it('inserts a job record with pending status', async () => {
    const jobRecord = { id: 'job-1', source_name: 'test-source', status: 'pending' };
    const dcBuilder = createQueryBuilder();
    dcBuilder.returning.mockResolvedValue([jobRecord]);
    tableBuilders.data_collection_jobs = dcBuilder;

    const result = await createJob('test-source');

    expect(result).toEqual(jobRecord);
    expect(dcBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        source_name: 'test-source',
        status: 'pending',
        manual_review_required: false,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// requeueJob
// ---------------------------------------------------------------------------

describe('requeueJob', () => {
  it('updates status to pending and clears manual_review_required', async () => {
    const existingJob = { id: 'job-1', status: 'failed', manual_review_required: true };
    const updatedJob = { id: 'job-1', status: 'pending', manual_review_required: false };

    const dcBuilder = createQueryBuilder();
    dcBuilder.first.mockResolvedValue(existingJob);
    dcBuilder.returning.mockResolvedValue([updatedJob]);
    dcBuilder.where.mockReturnThis();
    tableBuilders.data_collection_jobs = dcBuilder;

    const result = await requeueJob('job-1', 'user-1');

    expect(result).toEqual(updatedJob);
    expect(dcBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'pending',
        manual_review_required: false,
      }),
    );
  });

  it('returns null when job does not exist', async () => {
    const dcBuilder = createQueryBuilder();
    dcBuilder.first.mockResolvedValue(undefined);
    dcBuilder.where.mockReturnThis();
    tableBuilders.data_collection_jobs = dcBuilder;

    const result = await requeueJob('nonexistent', 'user-1');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// gracefulDegradation
// ---------------------------------------------------------------------------

describe('gracefulDegradation', () => {
  it('queues a failed job for manual review', async () => {
    const jobRecord = {
      id: 'job-2',
      source_name: 'broken-source',
      status: 'failed',
      manual_review_required: true,
    };

    const dcBuilder = createQueryBuilder();
    dcBuilder.returning.mockResolvedValue([jobRecord]);
    tableBuilders.data_collection_jobs = dcBuilder;

    const result = await gracefulDegradation('broken-source', 'timeout');

    expect(result).toEqual(jobRecord);
    expect(dcBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        source_name: 'broken-source',
        status: 'failed',
        manual_review_required: true,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// proxyPool
// ---------------------------------------------------------------------------

describe('getProxyPool', () => {
  it('returns configured proxies', () => {
    const proxies = getProxyPool();

    expect(Array.isArray(proxies)).toBe(true);
    expect(proxies.length).toBeGreaterThanOrEqual(1);
    expect(proxies[0]).toHaveProperty('host');
    expect(proxies[0]).toHaveProperty('port');
    expect(proxies[0]).toHaveProperty('protocol');
    expect(proxies[0]).toHaveProperty('healthy');
  });

  it('returns copies (not references to internal pool)', () => {
    const proxies = getProxyPool();
    proxies[0].host = 'mutated';

    const fresh = getProxyPool();
    expect(fresh[0].host).not.toBe('mutated');
  });
});

// ---------------------------------------------------------------------------
// userAgentPool
// ---------------------------------------------------------------------------

describe('getUserAgentPool', () => {
  it('returns different user agent strings', () => {
    const agents = getUserAgentPool();

    expect(Array.isArray(agents)).toBe(true);
    expect(agents.length).toBeGreaterThanOrEqual(2);
    for (const ua of agents) {
      expect(typeof ua).toBe('string');
      expect(ua.length).toBeGreaterThan(0);
    }
    const unique = new Set(agents);
    expect(unique.size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// cookieStore
// ---------------------------------------------------------------------------

describe('cookieStore', () => {
  it('persists and retrieves cookies per source', () => {
    const cookies = { session: 'abc123', csrfToken: 'xyz' };
    cookieStore('source-a', cookies);

    const retrieved = cookieStore('source-a');
    expect(retrieved).toEqual(cookies);
  });

  it('returns null for unknown source', () => {
    const result = cookieStore('unknown-source-xyz');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// captchaPlugin
// ---------------------------------------------------------------------------

describe('captchaPlugin', () => {
  it('returns a mock token with source and solved flag', () => {
    const result = captchaPlugin('test-source');

    expect(result).toHaveProperty('source', 'test-source');
    expect(result).toHaveProperty('token');
    expect(typeof result.token).toBe('string');
    expect(result.token.startsWith('mock-captcha-token-')).toBe(true);
    expect(result).toHaveProperty('solved', true);
  });

  it('generates unique tokens on each call', () => {
    const r1 = captchaPlugin('src1');
    const r2 = captchaPlugin('src2');
    expect(r1.token).not.toBe(r2.token);
  });
});
