/**
 * Cache Provider Plugin
 *
 * Supports Redis and in-memory caching modes based on config.cacheMode.
 * Provides a unified API for get/set/delete/purge operations with
 * structured logging of cache hits and misses.
 */

import config from '../config/index.js';
import { createLogger } from '../logging/index.js';

const log = createLogger('cache');

// ---------------------------------------------------------------------------
// Cache key conventions (from the invalidation matrix)
// ---------------------------------------------------------------------------

export const CACHE_KEYS = {
  CATALOG_TREE: 'catalog:tree',
  RECIPES_APPROVED: 'recipes:approved',
  INVENTORY_SNAPSHOT_TODAY: 'inventory:snapshot:today',
  ENTITLEMENT_TYPES: 'entitlement:types',
  EVENTS_LIST: 'events:list',
};

export const CACHE_TTLS = {
  CATALOG_TREE: 86400,
  RECIPES_APPROVED: 3600,
  INVENTORY_SNAPSHOT_TODAY: 1800,
  ENTITLEMENT_TYPES: 3600,
  EVENTS_LIST: 300,
};

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/** @type {'memory'|'redis'} */
let mode = 'memory';

/** @type {Map<string, { value: string, timer: ReturnType<typeof setTimeout> }>} */
let memoryStore = new Map();

/** @type {import('ioredis').default|null} */
let redisClient = null;

let stats = { hits: 0, misses: 0 };

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the cache provider.
 *
 * In `memory` mode, creates an in-memory Map with timeout-based expiry.
 * In `redis` mode, connects an ioredis client using config.redisUrl.
 *
 * @returns {Promise<void>}
 */
export async function initCache() {
  mode = config.cacheMode === 'redis' ? 'redis' : 'memory';
  stats = { hits: 0, misses: 0 };

  if (mode === 'redis') {
    const Redis = (await import('ioredis')).default;
    redisClient = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    redisClient.on('error', (err) => {
      log.error({ action: 'redisError', err }, '[cache][redisError] Redis client error');
    });

    redisClient.on('connect', () => {
      log.info({ action: 'redisConnect' }, '[cache][redisConnect] Connected to Redis');
    });

    await redisClient.connect();
    log.info({ action: 'init', mode: 'redis' }, '[cache][init] Cache initialized in redis mode');
  } else {
    memoryStore = new Map();
    log.info({ action: 'init', mode: 'memory' }, '[cache][init] Cache initialized in memory mode');
  }
}

// ---------------------------------------------------------------------------
// Get
// ---------------------------------------------------------------------------

/**
 * Retrieve a cached value by key.
 *
 * @param {string} key
 * @returns {Promise<*|null>} Parsed JSON value or null if not found/expired
 */
export async function cacheGet(key) {
  if (mode === 'redis') {
    const raw = await redisClient.get(key);
    if (raw === null) {
      stats.misses++;
      log.debug({ action: 'miss', key }, `[cache][miss] Cache miss for ${key}`);
      return null;
    }
    stats.hits++;
    log.debug({ action: 'hit', key }, `[cache][hit] Cache hit for ${key}`);
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  // Memory mode
  const entry = memoryStore.get(key);
  if (!entry) {
    stats.misses++;
    log.debug({ action: 'miss', key }, `[cache][miss] Cache miss for ${key}`);
    return null;
  }
  stats.hits++;
  log.debug({ action: 'hit', key }, `[cache][hit] Cache hit for ${key}`);
  try {
    return JSON.parse(entry.value);
  } catch {
    return entry.value;
  }
}

// ---------------------------------------------------------------------------
// Set
// ---------------------------------------------------------------------------

/**
 * Store a value in the cache with an optional TTL.
 *
 * @param {string} key
 * @param {*}      value       - Will be JSON-stringified
 * @param {number} [ttlSeconds] - Time-to-live in seconds (omit for no expiry)
 * @returns {Promise<void>}
 */
export async function cacheSet(key, value, ttlSeconds) {
  const serialized = JSON.stringify(value);

  if (mode === 'redis') {
    if (ttlSeconds) {
      await redisClient.set(key, serialized, 'EX', ttlSeconds);
    } else {
      await redisClient.set(key, serialized);
    }
    log.debug({ action: 'set', key, ttlSeconds }, `[cache][set] Set ${key} (TTL ${ttlSeconds ?? 'none'}s)`);
    return;
  }

  // Memory mode: clear any existing timer for this key
  const existing = memoryStore.get(key);
  if (existing && existing.timer) {
    clearTimeout(existing.timer);
  }

  let timer = null;
  if (ttlSeconds) {
    timer = setTimeout(() => {
      memoryStore.delete(key);
      log.debug({ action: 'expire', key }, `[cache][expire] Key ${key} expired`);
    }, ttlSeconds * 1000);
    // Unref so the timer doesn't prevent process exit
    if (timer.unref) timer.unref();
  }

  memoryStore.set(key, { value: serialized, timer });
  log.debug({ action: 'set', key, ttlSeconds }, `[cache][set] Set ${key} (TTL ${ttlSeconds ?? 'none'}s)`);
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * Delete a single cache key.
 *
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function cacheDel(key) {
  if (mode === 'redis') {
    await redisClient.del(key);
    log.debug({ action: 'del', key }, `[cache][del] Deleted ${key}`);
    return;
  }

  const entry = memoryStore.get(key);
  if (entry && entry.timer) {
    clearTimeout(entry.timer);
  }
  memoryStore.delete(key);
  log.debug({ action: 'del', key }, `[cache][del] Deleted ${key}`);
}

// ---------------------------------------------------------------------------
// Delete by pattern
// ---------------------------------------------------------------------------

/**
 * Delete all cache keys matching a pattern.
 *
 * In memory mode, performs a prefix match.
 * In Redis mode, uses SCAN to find matching keys.
 *
 * @param {string} pattern - Pattern to match (prefix for memory, glob for Redis)
 * @returns {Promise<number>} Number of keys deleted
 */
export async function cacheDelPattern(pattern) {
  let deleted = 0;

  if (mode === 'redis') {
    // Use SCAN to avoid blocking Redis with KEYS
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await redisClient.del(...keys);
        deleted += keys.length;
      }
    } while (cursor !== '0');
  } else {
    // Memory mode: prefix match (strip trailing * for prefix matching)
    const prefix = pattern.endsWith('*') ? pattern.slice(0, -1) : pattern;
    for (const [key, entry] of memoryStore) {
      if (key.startsWith(prefix)) {
        if (entry.timer) clearTimeout(entry.timer);
        memoryStore.delete(key);
        deleted++;
      }
    }
  }

  log.info(
    { action: 'delPattern', pattern, deleted },
    `[cache][delPattern] Deleted ${deleted} key(s) matching ${pattern}`,
  );
  return deleted;
}

// ---------------------------------------------------------------------------
// Purge
// ---------------------------------------------------------------------------

/**
 * Flush the entire cache.
 *
 * @returns {Promise<void>}
 */
export async function cachePurge() {
  if (mode === 'redis') {
    await redisClient.flushdb();
    log.info({ action: 'purge' }, '[cache][purge] Flushed Redis database');
    return;
  }

  // Clear all timers before clearing the map
  for (const [, entry] of memoryStore) {
    if (entry.timer) clearTimeout(entry.timer);
  }
  memoryStore.clear();
  log.info({ action: 'purge' }, '[cache][purge] Flushed in-memory cache');
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/**
 * Return cache hit/miss statistics.
 *
 * @returns {{ hits: number, misses: number, mode: string, keys: number }}
 */
export function getCacheStats() {
  const keys = mode === 'redis' ? -1 : memoryStore.size;
  return {
    hits: stats.hits,
    misses: stats.misses,
    mode,
    keys,
  };
}

// ---------------------------------------------------------------------------
// Shutdown
// ---------------------------------------------------------------------------

/**
 * Release any backing resources held by the cache provider.
 *
 * In redis mode, closes the ioredis client. In memory mode, clears pending
 * expiry timers so the process can exit cleanly.
 *
 * @returns {Promise<void>}
 */
export async function shutdownCache() {
  if (mode === 'redis') {
    if (redisClient) {
      try {
        await redisClient.quit();
      } catch {
        redisClient.disconnect();
      }
      redisClient = null;
    }
    log.info({ action: 'shutdown', mode: 'redis' }, '[cache][shutdown] Redis client closed');
    return;
  }

  for (const [, entry] of memoryStore) {
    if (entry.timer) clearTimeout(entry.timer);
  }
  memoryStore.clear();
  log.info({ action: 'shutdown', mode: 'memory' }, '[cache][shutdown] In-memory cache cleared');
}
