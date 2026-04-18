/**
 * Unit tests for the cache plugin.
 */

// Mock ioredis before importing cache module
vi.mock('ioredis', () => {
  const store = new Map();
  class MockRedis {
    constructor() {
      this._store = store;
      this._listeners = {};
    }
    on(event, cb) {
      this._listeners[event] = cb;
    }
    async connect() {
      if (this._listeners.connect) this._listeners.connect();
    }
    async get(key) {
      return this._store.get(key) ?? null;
    }
    async set(key, value, ...args) {
      this._store.set(key, value);
    }
    async del(...keys) {
      for (const k of keys) this._store.delete(k);
    }
    async flushdb() {
      this._store.clear();
    }
    async scan(cursor, _match, pattern, _count, count) {
      const prefix = pattern.endsWith('*') ? pattern.slice(0, -1) : pattern;
      const matched = [];
      for (const k of this._store.keys()) {
        if (k.startsWith(prefix)) matched.push(k);
      }
      return ['0', matched];
    }
  }
  return { default: MockRedis };
});

vi.mock('../../src/config/index.js', () => ({
  default: {
    cacheMode: 'memory',
    redisUrl: 'redis://localhost:6379',
  },
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
  CACHE_KEYS,
  CACHE_TTLS,
  initCache,
  cacheGet,
  cacheSet,
  cacheDel,
  cachePurge,
  getCacheStats,
  cacheDelPattern,
} from '../../src/plugins/cache.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('CACHE_KEYS', () => {
  it('defines the expected key constants', () => {
    expect(CACHE_KEYS.CATALOG_TREE).toBe('catalog:tree');
    expect(CACHE_KEYS.RECIPES_APPROVED).toBe('recipes:approved');
    expect(CACHE_KEYS.INVENTORY_SNAPSHOT_TODAY).toBe('inventory:snapshot:today');
    expect(CACHE_KEYS.ENTITLEMENT_TYPES).toBe('entitlement:types');
    expect(CACHE_KEYS.EVENTS_LIST).toBe('events:list');
  });
});

describe('CACHE_TTLS', () => {
  it('defines correct TTL values in seconds', () => {
    expect(CACHE_TTLS.CATALOG_TREE).toBe(86400);
    expect(CACHE_TTLS.RECIPES_APPROVED).toBe(3600);
    expect(CACHE_TTLS.INVENTORY_SNAPSHOT_TODAY).toBe(1800);
    expect(CACHE_TTLS.ENTITLEMENT_TYPES).toBe(3600);
    expect(CACHE_TTLS.EVENTS_LIST).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// Memory mode
// ---------------------------------------------------------------------------

describe('cache (memory mode)', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    await initCache();
  });

  afterEach(async () => {
    await cachePurge();
    vi.useRealTimers();
  });

  it('initCache initializes without error in memory mode', async () => {
    // initCache already called in beforeEach; verify stats are reset
    const stats = getCacheStats();
    expect(stats.mode).toBe('memory');
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
  });

  it('cacheSet stores a value and cacheGet retrieves it', async () => {
    await cacheSet('testKey', { foo: 'bar' });
    const result = await cacheGet('testKey');
    expect(result).toEqual({ foo: 'bar' });
  });

  it('cacheGet returns null for a missing key', async () => {
    const result = await cacheGet('nonexistent');
    expect(result).toBeNull();
  });

  it('cacheSet with TTL expires the value after the duration', async () => {
    await cacheSet('expiring', 'data', 5); // 5 seconds

    // Value should be present before expiry
    const before = await cacheGet('expiring');
    expect(before).toBe('data');

    // Advance timers past the TTL
    vi.advanceTimersByTime(6000);

    const after = await cacheGet('expiring');
    expect(after).toBeNull();
  });

  it('cacheDel removes a stored key', async () => {
    await cacheSet('toDelete', 'val');
    await cacheDel('toDelete');
    const result = await cacheGet('toDelete');
    expect(result).toBeNull();
  });

  it('cachePurge clears all entries', async () => {
    await cacheSet('a', 1);
    await cacheSet('b', 2);
    await cachePurge();

    expect(await cacheGet('a')).toBeNull();
    expect(await cacheGet('b')).toBeNull();
    expect(getCacheStats().keys).toBe(0);
  });

  it('getCacheStats tracks hits and misses correctly', async () => {
    await cacheSet('hit', 'yes');
    await cacheGet('hit');    // hit
    await cacheGet('hit');    // hit
    await cacheGet('miss1');  // miss
    await cacheGet('miss2');  // miss

    const stats = getCacheStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(2);
    expect(stats.mode).toBe('memory');
    expect(stats.keys).toBe(1);
  });

  it('cacheDelPattern removes keys matching a prefix', async () => {
    await cacheSet('prefix:one', 1);
    await cacheSet('prefix:two', 2);
    await cacheSet('other:three', 3);

    const deleted = await cacheDelPattern('prefix:*');
    expect(deleted).toBe(2);

    expect(await cacheGet('prefix:one')).toBeNull();
    expect(await cacheGet('prefix:two')).toBeNull();
    expect(await cacheGet('other:three')).toBe(3);
  });

  it('cacheSet overwrites an existing key and clears its old timer', async () => {
    await cacheSet('overwrite', 'first', 10);
    await cacheSet('overwrite', 'second', 60);

    // Advance past the original TTL but not the new one
    vi.advanceTimersByTime(15_000);

    const result = await cacheGet('overwrite');
    expect(result).toBe('second');
  });
});
