/**
 * Data Collection Service
 *
 * Internal anti-crawling data-collection subsystem. NO internet dependency.
 * This is a stub/mock implementation that manages proxy pools, user agent
 * rotation, cookie persistence, redirect parsing, health checks,
 * graceful degradation, and CAPTCHA plugin hooks.
 *
 * All operations are logged. Jobs are tracked in the data_collection_jobs table.
 */

import { randomUUID } from 'node:crypto';
import db from '../../db/connection.js';
import { createLogger } from '../../logging/index.js';
import { writeAudit } from '../../shared/audit.js';

const log = createLogger('data-collection:service');

// ---------------------------------------------------------------------------
// Configurable pools (stub data)
// ---------------------------------------------------------------------------

/** Configurable proxy pool definitions. */
const proxyPool = [
  { id: 'proxy-1', host: '127.0.0.1', port: 8080, protocol: 'http', healthy: true },
  { id: 'proxy-2', host: '127.0.0.1', port: 8081, protocol: 'http', healthy: true },
  { id: 'proxy-3', host: '127.0.0.1', port: 8082, protocol: 'socks5', healthy: true },
];

/** Rotating user agent strings. */
const userAgentPool = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0',
];

/** In-memory cookie/session persistence per source. */
const cookieJar = new Map();

/** In-memory redirect chain log per job. */
const redirectLog = new Map();

let userAgentIndex = 0;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Get the next user agent from the rotation pool.
 * @returns {string}
 */
function getNextUserAgent() {
  const ua = userAgentPool[userAgentIndex % userAgentPool.length];
  userAgentIndex += 1;
  return ua;
}

/**
 * Pick a healthy proxy from the pool.
 * @returns {object|null}
 */
function pickProxy() {
  const healthy = proxyPool.filter((p) => p.healthy);
  if (healthy.length === 0) return null;
  return healthy[Math.floor(Math.random() * healthy.length)];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get proxy pool status.
 * @returns {object[]}
 */
export function getProxyPool() {
  return proxyPool.map((p) => ({ ...p }));
}

/**
 * Get the current user agent pool.
 * @returns {string[]}
 */
export function getUserAgentPool() {
  return [...userAgentPool];
}

/**
 * Get or set cookies for a given source.
 *
 * @param {string} source - Source identifier
 * @param {object} [cookies] - If provided, sets cookies
 * @returns {object|null}
 */
export function cookieStore(source, cookies) {
  if (cookies !== undefined) {
    cookieJar.set(source, cookies);
    log.debug({ action: 'cookieStore', source }, 'Cookies stored for source');
  }
  return cookieJar.get(source) || null;
}

/**
 * Parse and log a redirect chain (stub).
 *
 * @param {string} jobId
 * @param {string[]} redirectChain - Array of URLs in the redirect chain
 * @returns {{ jobId: string, chain: string[] }}
 */
export function redirectParser(jobId, redirectChain) {
  log.info(
    { action: 'redirectParser', jobId, hops: redirectChain.length },
    `Logged redirect chain with ${redirectChain.length} hop(s)`,
  );

  redirectLog.set(jobId, redirectChain);

  return { jobId, chain: redirectChain };
}

/**
 * Periodic health check: pings configured proxy sources and updates status.
 *
 * @returns {Promise<{ healthy: number, unhealthy: number, proxies: object[] }>}
 */
export async function healthCheck() {
  log.info({ action: 'healthCheck' }, 'Running data-collection subsystem health check');

  // Stub: all proxies remain in their current state
  const healthy = proxyPool.filter((p) => p.healthy).length;
  const unhealthy = proxyPool.length - healthy;

  // Check DB connectivity for job tracking
  let dbHealthy = false;
  try {
    await db.raw('SELECT 1');
    dbHealthy = true;
  } catch {
    dbHealthy = false;
  }

  // Count pending/failed jobs
  const [{ pending_count }] = await db('data_collection_jobs')
    .where('status', 'pending')
    .count('id as pending_count');

  const [{ failed_count }] = await db('data_collection_jobs')
    .where('status', 'failed')
    .count('id as failed_count');

  const result = {
    dbHealthy,
    healthy,
    unhealthy,
    pendingJobs: Number(pending_count),
    failedJobs: Number(failed_count),
    proxies: proxyPool.map((p) => ({ id: p.id, host: p.host, port: p.port, healthy: p.healthy })),
    cookieSources: [...cookieJar.keys()],
    userAgentPoolSize: userAgentPool.length,
  };

  log.info({ action: 'healthCheck', result }, 'Health check completed');

  return result;
}

/**
 * Graceful degradation: on failure, queue a job for manual review.
 *
 * @param {string} sourceName
 * @param {string} failureReason
 * @returns {Promise<object>} The created job record
 */
export async function gracefulDegradation(sourceName, failureReason) {
  log.warn(
    { action: 'gracefulDegradation', sourceName, failureReason },
    'Queueing failed job for manual review',
  );

  const proxy = pickProxy();
  const userAgent = getNextUserAgent();

  const [job] = await db('data_collection_jobs')
    .insert({
      source_name: sourceName,
      status: 'failed',
      proxy_used: proxy ? `${proxy.protocol}://${proxy.host}:${proxy.port}` : null,
      user_agent: userAgent,
      redirect_chain_json: null,
      cookies_json: cookieJar.has(sourceName) ? JSON.stringify(cookieJar.get(sourceName)) : null,
      result_ref: null,
      manual_review_required: true,
    })
    .returning('*');

  log.info(
    { action: 'gracefulDegradation', jobId: job.id },
    `Failed job ${job.id} queued for manual review`,
  );

  return job;
}

/**
 * CAPTCHA plugin hook (stub). Does not integrate with real CAPTCHA.
 * Returns a mock token for testing purposes.
 *
 * @param {string} source
 * @returns {{ source: string, token: string, solved: boolean }}
 */
export function captchaPlugin(source) {
  log.info({ action: 'captchaPlugin', source }, 'CAPTCHA plugin hook invoked (stub)');

  return {
    source,
    token: `mock-captcha-token-${randomUUID().slice(0, 8)}`,
    solved: true,
  };
}

/**
 * Create a data collection job.
 *
 * @param {string} sourceName
 * @returns {Promise<object>}
 */
export async function createJob(sourceName) {
  log.info({ action: 'createJob', sourceName }, 'Creating data collection job');

  const proxy = pickProxy();
  const userAgent = getNextUserAgent();

  const [job] = await db('data_collection_jobs')
    .insert({
      source_name: sourceName,
      status: 'pending',
      proxy_used: proxy ? `${proxy.protocol}://${proxy.host}:${proxy.port}` : null,
      user_agent: userAgent,
      redirect_chain_json: null,
      cookies_json: cookieJar.has(sourceName) ? JSON.stringify(cookieJar.get(sourceName)) : null,
      result_ref: null,
      manual_review_required: false,
    })
    .returning('*');

  return job;
}

/**
 * Requeue a failed job: reset status to pending and clear manual review flag.
 *
 * @param {string} jobId - UUID
 * @param {string} userId - Actor user UUID
 * @returns {Promise<object>} Updated job record
 */
export async function requeueJob(jobId, userId) {
  log.info({ action: 'requeueJob', jobId, userId }, 'Requeuing data collection job');

  const existing = await db('data_collection_jobs').where({ id: jobId }).first();
  if (!existing) {
    return null;
  }

  const [updated] = await db('data_collection_jobs')
    .where({ id: jobId })
    .update({
      status: 'pending',
      manual_review_required: false,
      updated_at: db.fn.now(),
    })
    .returning('*');

  await writeAudit({
    eventId: null,
    subjectType: 'data_collection_job',
    subjectId: jobId,
    action: 'requeue',
    actorUserId: userId,
    before: { status: existing.status, manual_review_required: existing.manual_review_required },
    after: { status: 'pending', manual_review_required: false },
    notes: `Requeued data collection job ${jobId}`,
  });

  return updated;
}

/**
 * List data collection jobs (paginated).
 *
 * @param {object} filters
 * @param {number} filters.page
 * @param {number} filters.pageSize
 * @param {string} [filters.status]
 * @returns {Promise<{ data: object[], total: number }>}
 */
export async function listJobs(filters) {
  log.debug({ action: 'listJobs', filters }, 'Listing data collection jobs');

  let countQuery = db('data_collection_jobs');
  let dataQuery = db('data_collection_jobs').select('*');

  if (filters.status) {
    countQuery = countQuery.where('status', filters.status);
    dataQuery = dataQuery.where('status', filters.status);
  }

  const [{ count }] = await countQuery.count('id as count');
  const total = Number(count);

  const offset = (filters.page - 1) * filters.pageSize;
  const data = await dataQuery
    .orderBy('created_at', 'desc')
    .limit(filters.pageSize)
    .offset(offset);

  return { data, total };
}
