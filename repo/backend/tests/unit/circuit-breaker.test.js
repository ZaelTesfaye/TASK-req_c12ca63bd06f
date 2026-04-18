/**
 * Unit tests for the circuit breaker plugin.
 */

// vi.mock is hoisted above imports, so a top-level
// `import { EventEmitter }` is in the temporal dead zone when the factory
// runs. Use vi.hoisted for the shared instance store and let the factory
// pull EventEmitter in via `await import()` at call time.
const { createdBreakers } = vi.hoisted(() => ({ createdBreakers: [] }));

vi.mock('opossum', async () => {
  const { EventEmitter } = await import('node:events');
  class MockCircuitBreaker extends EventEmitter {
    constructor(fn, opts) {
      super();
      this._fn = fn;
      this._opts = opts;
      this.opened = false;
      this.halfOpen = false;
      this.stats = { fires: 0, failures: 0, successes: 0 };
      this._fallbackFn = null;
      createdBreakers.push(this);
    }
    fallback(fn) {
      this._fallbackFn = fn;
    }
    async fire(...args) {
      if (this.opened && this._fallbackFn) {
        return this._fallbackFn(...args);
      }
      return this._fn(...args);
    }
  }
  return { default: MockCircuitBreaker };
});

vi.mock('../../src/config/index.js', () => ({
  default: {
    circuitBreaker: {
      timeoutMs: 5000,
      errorThresholdPercent: 10,
      rollingWindowMs: 60000,
      resetTimeoutMs: 30000,
    },
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

// We need to dynamically import the module after mocks are in place,
// because the module caches its breakers map internally.
let createCircuitBreaker;
let getCircuitStatus;

beforeEach(async () => {
  vi.resetModules();
  createdBreakers.length = 0;
  logMock.info.mockClear();
  logMock.warn.mockClear();
  logMock.error.mockClear();

  const mod = await import('../../src/plugins/circuit-breaker.js');
  createCircuitBreaker = mod.createCircuitBreaker;
  getCircuitStatus = mod.getCircuitStatus;
});

describe('createCircuitBreaker', () => {
  it('creates a breaker with default config values', () => {
    const fn = vi.fn();
    const breaker = createCircuitBreaker('inventory', fn);

    expect(breaker).toBeDefined();
    expect(breaker._opts.timeout).toBe(5000);
    expect(breaker._opts.errorThresholdPercentage).toBe(10);
    expect(breaker._opts.rollingCountTimeout).toBe(60000);
    expect(breaker._opts.resetTimeout).toBe(30000);
  });

  it('returns the existing breaker if the same name is registered again', () => {
    const fn = vi.fn();
    const first = createCircuitBreaker('payment', fn);
    const second = createCircuitBreaker('payment', vi.fn());

    expect(second).toBe(first);
  });

  it('allows custom options to override defaults', () => {
    const fn = vi.fn();
    const breaker = createCircuitBreaker('custom', fn, {
      timeout: 1000,
      errorThresholdPercentage: 50,
    });

    expect(breaker._opts.timeout).toBe(1000);
    expect(breaker._opts.errorThresholdPercentage).toBe(50);
  });

  it('multiple breakers can coexist with different names', () => {
    const b1 = createCircuitBreaker('svc-a', vi.fn());
    const b2 = createCircuitBreaker('svc-b', vi.fn());

    expect(b1).not.toBe(b2);
    expect(createdBreakers.length).toBe(2);
  });
});

describe('getCircuitStatus', () => {
  it('returns status for an existing breaker', () => {
    createCircuitBreaker('status-test', vi.fn());
    const status = getCircuitStatus('status-test');

    expect(status).toBeDefined();
    expect(status.name).toBe('status-test');
    expect(status.state).toBe('closed');
    expect(status.stats).toBeDefined();
  });

  it('returns null for an unknown breaker name', () => {
    expect(getCircuitStatus('does-not-exist')).toBeNull();
  });

  it('reports open state when breaker is opened', () => {
    const breaker = createCircuitBreaker('open-test', vi.fn());
    breaker.opened = true;

    const status = getCircuitStatus('open-test');
    expect(status.state).toBe('open');
  });

  it('reports half-open state correctly', () => {
    const breaker = createCircuitBreaker('half-test', vi.fn());
    breaker.opened = false;
    breaker.halfOpen = true;

    const status = getCircuitStatus('half-test');
    expect(status.state).toBe('half-open');
  });
});

describe('state transition logging', () => {
  it('logs when the circuit opens', () => {
    const breaker = createCircuitBreaker('log-open', vi.fn());
    breaker.emit('open');

    expect(logMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'open', subsystem: 'log-open' }),
      expect.stringContaining('OPEN'),
    );
  });

  it('logs when the circuit goes half-open', () => {
    const breaker = createCircuitBreaker('log-half', vi.fn());
    breaker.emit('halfOpen');

    expect(logMock.info).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'halfOpen', subsystem: 'log-half' }),
      expect.stringContaining('HALF-OPEN'),
    );
  });

  it('logs when the circuit closes', () => {
    const breaker = createCircuitBreaker('log-close', vi.fn());
    breaker.emit('close');

    expect(logMock.info).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'close', subsystem: 'log-close' }),
      expect.stringContaining('CLOSED'),
    );
  });
});

describe('fallback', () => {
  it('returns ServiceTemporarilyUnavailable error when circuit is open', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    const breaker = createCircuitBreaker('fallback-test', fn);

    // Simulate open state
    breaker.opened = true;

    const result = await breaker.fire();
    expect(result).toEqual({
      error: 'ServiceTemporarilyUnavailable',
      subsystem: 'fallback-test',
    });
  });
});
