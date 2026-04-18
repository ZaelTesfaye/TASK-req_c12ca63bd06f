/**
 * Circuit Breaker Plugin
 *
 * Wraps calls to slow or unreliable subsystems using opossum.
 * Logs state transitions and provides status inspection per named breaker.
 */

import CircuitBreaker from 'opossum';
import config from '../config/index.js';
import { createLogger } from '../logging/index.js';

const log = createLogger('circuit-breaker');

// ---------------------------------------------------------------------------
// Registry of named breakers
// ---------------------------------------------------------------------------

/** @type {Map<string, CircuitBreaker>} */
const breakers = new Map();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create (and register) a named circuit breaker around the provided function.
 *
 * If a breaker with the same name already exists, it is returned without
 * creating a duplicate.
 *
 * @param {string}   name    - Logical subsystem name (e.g. 'inventory', 'payment')
 * @param {Function} fn      - The async function to wrap
 * @param {object}   [options] - Override defaults from config.circuitBreaker
 * @returns {CircuitBreaker}
 */
export function createCircuitBreaker(name, fn, options = {}) {
  if (breakers.has(name)) {
    return breakers.get(name);
  }

  const cbConfig = config.circuitBreaker;

  const breaker = new CircuitBreaker(fn, {
    timeout: options.timeout ?? cbConfig.timeoutMs,
    errorThresholdPercentage: options.errorThresholdPercentage ?? cbConfig.errorThresholdPercent,
    rollingCountTimeout: options.rollingCountTimeout ?? cbConfig.rollingWindowMs,
    resetTimeout: options.resetTimeout ?? cbConfig.resetTimeoutMs,
    ...options,
  });

  // ---------------------------------------------------------------------------
  // State-transition logging
  // ---------------------------------------------------------------------------

  breaker.on('open', () => {
    log.warn(
      { action: 'open', subsystem: name },
      `[circuit-breaker][open] Circuit for "${name}" is now OPEN`,
    );
  });

  breaker.on('halfOpen', () => {
    log.info(
      { action: 'halfOpen', subsystem: name },
      `[circuit-breaker][halfOpen] Circuit for "${name}" is now HALF-OPEN`,
    );
  });

  breaker.on('close', () => {
    log.info(
      { action: 'close', subsystem: name },
      `[circuit-breaker][close] Circuit for "${name}" is now CLOSED`,
    );
  });

  // ---------------------------------------------------------------------------
  // Fallback when circuit is open
  // ---------------------------------------------------------------------------

  breaker.fallback(() => ({
    error: 'ServiceTemporarilyUnavailable',
    subsystem: name,
  }));

  breaker.on('fallback', () => {
    log.warn(
      { action: 'fallback', subsystem: name },
      `[circuit-breaker][fallback] Fallback triggered for "${name}"`,
    );
  });

  breaker.on('failure', (err) => {
    log.error(
      { action: 'failure', subsystem: name, err },
      `[circuit-breaker][failure] Call to "${name}" failed`,
    );
  });

  breaker.on('timeout', () => {
    log.warn(
      { action: 'timeout', subsystem: name },
      `[circuit-breaker][timeout] Call to "${name}" timed out`,
    );
  });

  breakers.set(name, breaker);

  log.info(
    { action: 'create', subsystem: name },
    `[circuit-breaker][create] Circuit breaker created for "${name}"`,
  );

  return breaker;
}

/**
 * Return the current status of a named circuit breaker.
 *
 * @param {string} name - The subsystem name used when creating the breaker
 * @returns {{ name: string, state: string, stats: object }|null}
 */
export function getCircuitStatus(name) {
  const breaker = breakers.get(name);
  if (!breaker) {
    return null;
  }

  return {
    name,
    state: breaker.opened ? 'open' : breaker.halfOpen ? 'half-open' : 'closed',
    stats: breaker.stats,
  };
}
