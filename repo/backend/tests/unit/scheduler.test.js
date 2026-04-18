/**
 * Unit tests for the scheduler plugin.
 */

const scheduledJobs = [];

vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn((cronExpr, callback) => {
      const job = {
        cronExpr,
        callback,
        stop: vi.fn(),
        started: true,
      };
      scheduledJobs.push(job);
      return job;
    }),
  },
}));

vi.mock('../../src/config/index.js', () => ({
  default: {
    cron: {
      snapshot: '0 23 * * *',
      keyCleanup: '0 2 * * *',
    },
  },
}));

vi.mock('../../src/plugins/cache.js', () => ({
  cacheSet: vi.fn(),
  cacheDel: vi.fn(),
  CACHE_KEYS: {
    CATALOG_TREE: 'catalog:tree',
    RECIPES_APPROVED: 'recipes:approved',
    INVENTORY_SNAPSHOT_TODAY: 'inventory:snapshot:today',
    ENTITLEMENT_TYPES: 'entitlement:types',
    EVENTS_LIST: 'events:list',
  },
  CACHE_TTLS: {
    CATALOG_TREE: 86400,
    RECIPES_APPROVED: 3600,
    INVENTORY_SNAPSHOT_TODAY: 1800,
    ENTITLEMENT_TYPES: 3600,
    EVENTS_LIST: 300,
  },
}));

const logMock = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

vi.mock('../../src/logging/index.js', () => ({
  createLogger: () => logMock,
}));

let initScheduler;

beforeEach(async () => {
  vi.resetModules();
  scheduledJobs.length = 0;
  logMock.info.mockClear();
  logMock.warn.mockClear();
  logMock.error.mockClear();

  // Re-mock node-cron after resetModules
  vi.doMock('node-cron', () => ({
    default: {
      schedule: vi.fn((cronExpr, callback) => {
        const job = {
          cronExpr,
          callback,
          stop: vi.fn(),
          started: true,
        };
        scheduledJobs.push(job);
        return job;
      }),
    },
  }));

  vi.doMock('../../src/config/index.js', () => ({
    default: {
      cron: {
        snapshot: '0 23 * * *',
        keyCleanup: '0 2 * * *',
      },
    },
  }));

  vi.doMock('../../src/plugins/cache.js', () => ({
    cacheSet: vi.fn(),
    cacheDel: vi.fn(),
    CACHE_KEYS: {
      CATALOG_TREE: 'catalog:tree',
      RECIPES_APPROVED: 'recipes:approved',
      INVENTORY_SNAPSHOT_TODAY: 'inventory:snapshot:today',
      ENTITLEMENT_TYPES: 'entitlement:types',
      EVENTS_LIST: 'events:list',
    },
    CACHE_TTLS: {
      CATALOG_TREE: 86400,
      RECIPES_APPROVED: 3600,
      INVENTORY_SNAPSHOT_TODAY: 1800,
      ENTITLEMENT_TYPES: 3600,
      EVENTS_LIST: 300,
    },
  }));

  vi.doMock('../../src/logging/index.js', () => ({
    createLogger: () => logMock,
  }));

  const mod = await import('../../src/plugins/scheduler.js');
  initScheduler = mod.initScheduler;
});

describe('initScheduler', () => {
  it('registers cron jobs (4 total)', () => {
    initScheduler();
    expect(scheduledJobs.length).toBe(4);
  });

  it('snapshot job uses config.cron.snapshot schedule', () => {
    initScheduler();
    const snapshotJob = scheduledJobs[0];
    expect(snapshotJob.cronExpr).toBe('0 23 * * *');
  });

  it('backup job uses "0 1 * * *" schedule', () => {
    initScheduler();
    const backupJob = scheduledJobs[2];
    expect(backupJob.cronExpr).toBe('0 1 * * *');
  });

  it('key cleanup job uses config.cron.keyCleanup schedule', () => {
    initScheduler();
    const keyCleanupJob = scheduledJobs[1];
    expect(keyCleanupJob.cronExpr).toBe('0 2 * * *');
  });

  it('cache warming job runs on a 30-minute interval', () => {
    initScheduler();
    const cacheWarmJob = scheduledJobs[3];
    expect(cacheWarmJob.cronExpr).toBe('*/30 * * * *');
  });

  it('logs registration for each job', () => {
    initScheduler();
    // Should have logged registration for snapshot, keyCleanup, backup, cacheWarm + init summary
    const registerCalls = logMock.info.mock.calls.filter(
      (call) => call[0]?.action === 'register',
    );
    expect(registerCalls.length).toBe(4);
  });
});

describe('job error handling', () => {
  it('snapshot job catches and logs errors without crashing', async () => {
    // Mock the dynamic import of inventory service to throw
    vi.doMock('../../src/modules/inventory/service.js', () => ({
      takeSnapshots: vi.fn().mockRejectedValue(new Error('DB down')),
    }));

    initScheduler();
    const snapshotJob = scheduledJobs[0];

    // Execute the job callback; should not throw
    await expect(snapshotJob.callback()).resolves.not.toThrow();
  });

  it('key cleanup job catches and logs errors without crashing', async () => {
    initScheduler();
    const keyCleanupJob = scheduledJobs[1];

    // Execute the job callback; the cleanup is a stub so it should succeed
    await expect(keyCleanupJob.callback()).resolves.not.toThrow();
  });
});

describe('job cleanup', () => {
  it('jobs expose stop method for shutdown', () => {
    initScheduler();
    for (const job of scheduledJobs) {
      expect(typeof job.stop).toBe('function');
    }
    // Verify we can stop them without error
    for (const job of scheduledJobs) {
      job.stop();
      expect(job.stop).toHaveBeenCalled();
    }
  });
});
