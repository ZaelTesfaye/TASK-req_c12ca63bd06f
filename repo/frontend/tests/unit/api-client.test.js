/**
 * Unit tests for the API client.
 * Source: src/lib/api/client.js
 *
 * Tests the ACTUAL production exports: get, post, put, patch, del, upload.
 * Mocks global fetch and the authState dependency to test the client logic
 * (headers, token refresh, structured responses) without a real server.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock sessionStorage (required by auth store)
// ---------------------------------------------------------------------------
const storage = {};
Object.defineProperty(globalThis, 'sessionStorage', {
  value: {
    getItem: vi.fn((k) => storage[k] ?? null),
    setItem: vi.fn((k, v) => { storage[k] = v; }),
    removeItem: vi.fn((k) => { delete storage[k]; }),
    clear: vi.fn(() => { for (const k of Object.keys(storage)) delete storage[k]; })
  },
  writable: true,
  configurable: true
});

// ---------------------------------------------------------------------------
// Helpers - create mock Response objects
// ---------------------------------------------------------------------------
function jsonResponse(body, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => {
        if (name.toLowerCase() === 'content-type') return 'application/json';
        return headers[name] ?? null;
      }
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body))
  };
}

function textResponse(text, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => {
        if (name.toLowerCase() === 'content-type') return 'text/plain';
        return null;
      }
    },
    json: () => Promise.reject(new Error('not json')),
    text: () => Promise.resolve(text)
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------
let apiClient;
let authState;

beforeEach(async () => {
  vi.resetModules();
  globalThis.fetch = vi.fn();

  // Provide import.meta.env.VITE_API_URL so getBaseUrl is deterministic
  vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api');

  const authMod = await import('../../src/lib/stores/auth.js');
  authState = authMod.authState;

  // Log in so there is a token for requests
  authState.login({
    user: { id: 'u1', email: 'a@b.com', name: 'Tester', roles: ['admin'] },
    token: 'test-token',
    refreshToken: 'test-refresh-token',
    permissions: ['event:read'],
    roles: ['admin']
  });

  apiClient = await import('../../src/lib/api/client.js');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests - Module exports
// ---------------------------------------------------------------------------
describe('API client exports', () => {
  it('exports get function', () => {
    expect(typeof apiClient.get).toBe('function');
  });

  it('exports post function', () => {
    expect(typeof apiClient.post).toBe('function');
  });

  it('exports put function', () => {
    expect(typeof apiClient.put).toBe('function');
  });

  it('exports patch function', () => {
    expect(typeof apiClient.patch).toBe('function');
  });

  it('exports del function', () => {
    expect(typeof apiClient.del).toBe('function');
  });

  it('exports upload function', () => {
    expect(typeof apiClient.upload).toBe('function');
  });

  it('exports a default object with all methods', () => {
    expect(apiClient.default).toBeDefined();
    expect(typeof apiClient.default.get).toBe('function');
    expect(typeof apiClient.default.post).toBe('function');
    expect(typeof apiClient.default.put).toBe('function');
    expect(typeof apiClient.default.patch).toBe('function');
    expect(typeof apiClient.default.del).toBe('function');
    expect(typeof apiClient.default.upload).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Tests - get()
// ---------------------------------------------------------------------------
describe('API client - get()', () => {
  it('makes a GET request with Authorization header', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ items: [] }));

    const result = await apiClient.get('/events');

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/events');
    expect(opts.method).toBe('GET');
    expect(opts.headers['Authorization']).toBe('Bearer test-token');
  });

  it('returns { data, error: null } on success', async () => {
    const payload = { id: '1', title: 'Test Event' };
    globalThis.fetch.mockResolvedValueOnce(jsonResponse(payload));

    const { data, error } = await apiClient.get('/events/1');

    expect(data).toEqual(payload);
    expect(error).toBeNull();
  });

  it('prepends base URL to relative paths', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({}));

    await apiClient.get('/events');

    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/events');
  });

  it('handles paths without leading slash', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({}));

    await apiClient.get('events');

    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/events');
  });
});

// ---------------------------------------------------------------------------
// Tests - post()
// ---------------------------------------------------------------------------
describe('API client - post()', () => {
  it('makes a POST request with JSON body', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ id: 'new-1' }, 201));

    const body = { title: 'Gala', headcount: 200 };
    const result = await apiClient.post('/events', body);

    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(opts.body)).toEqual(body);
    expect(result.data).toEqual({ id: 'new-1' });
    expect(result.error).toBeNull();
  });

  it('sends POST without body when body is null', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await apiClient.post('/trigger');

    const [, opts] = globalThis.fetch.mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(opts.body).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests - put()
// ---------------------------------------------------------------------------
describe('API client - put()', () => {
  it('sends PUT request with JSON body', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ updated: true }));

    await apiClient.put('/events/1', { title: 'Updated' });

    const [, opts] = globalThis.fetch.mock.calls[0];
    expect(opts.method).toBe('PUT');
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(opts.body)).toEqual({ title: 'Updated' });
  });
});

// ---------------------------------------------------------------------------
// Tests - patch()
// ---------------------------------------------------------------------------
describe('API client - patch()', () => {
  it('sends PATCH request with JSON body', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ updated: true }));

    await apiClient.patch('/events/1/state', { state: 'approved' });

    const [, opts] = globalThis.fetch.mock.calls[0];
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body)).toEqual({ state: 'approved' });
  });
});

// ---------------------------------------------------------------------------
// Tests - del()
// ---------------------------------------------------------------------------
describe('API client - del()', () => {
  it('sends DELETE request', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse(null, 204));

    await apiClient.del('/events/1');

    const [, opts] = globalThis.fetch.mock.calls[0];
    expect(opts.method).toBe('DELETE');
  });

  it('does not send a body with DELETE', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse(null, 204));

    await apiClient.del('/events/1');

    const [, opts] = globalThis.fetch.mock.calls[0];
    expect(opts.body).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests - upload()
// ---------------------------------------------------------------------------
describe('API client - upload()', () => {
  it('sends FormData without manually setting Content-Type', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ id: 'att-1' }, 201));

    const formData = new FormData();
    formData.append('file', new Blob(['hello'], { type: 'text/plain' }), 'test.txt');

    const { data, error } = await apiClient.upload('/attachments', formData);

    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(opts.method).toBe('POST');
    // Content-Type should NOT be set for FormData (browser sets it with boundary)
    expect(opts.headers['Content-Type']).toBeUndefined();
    expect(data).toEqual({ id: 'att-1' });
    expect(error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests - Error handling
// ---------------------------------------------------------------------------
describe('API client - error handling', () => {
  it('returns structured error on non-OK response', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse({ message: 'Not Found' }, 404)
    );

    const { data, error } = await apiClient.get('/events/unknown');

    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect(error.status).toBe(404);
    expect(error.message).toBe('Not Found');
  });

  it('returns structured error on network failure', async () => {
    globalThis.fetch.mockRejectedValueOnce(new Error('Network Error'));

    const { data, error } = await apiClient.get('/events');

    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect(error.status).toBe(0);
    expect(error.message).toContain('Network Error');
  });

  it('includes details and code from error response when available', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse({ message: 'Validation failed', details: { field: 'title' }, code: 'VALIDATION_ERROR' }, 422)
    );

    const { error } = await apiClient.post('/events', { title: '' });

    expect(error.status).toBe(422);
    expect(error.message).toBe('Validation failed');
    expect(error.details).toEqual({ field: 'title' });
    expect(error.code).toBe('VALIDATION_ERROR');
  });

  it('handles AbortError gracefully', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    globalThis.fetch.mockRejectedValueOnce(abortError);

    const { data, error } = await apiClient.get('/events');

    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect(error.status).toBe(0);
    expect(error.message).toContain('aborted');
  });

  it('generates fallback message when error response has no message', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse({}, 500)
    );

    const { error } = await apiClient.get('/events');

    expect(error.status).toBe(500);
    expect(error.message).toContain('500');
  });
});

// ---------------------------------------------------------------------------
// Tests - Auth header behavior
// ---------------------------------------------------------------------------
describe('API client - auth header', () => {
  it('includes Bearer token when user is authenticated', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({}));

    await apiClient.get('/events');

    const [, opts] = globalThis.fetch.mock.calls[0];
    expect(opts.headers['Authorization']).toBe('Bearer test-token');
  });

  it('omits auth header when skipAuth is true', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({}));

    await apiClient.get('/public-data', { skipAuth: true });

    const [, opts] = globalThis.fetch.mock.calls[0];
    expect(opts.headers['Authorization']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests - 401 and token refresh
// ---------------------------------------------------------------------------
describe('API client - 401 and token refresh', () => {
  it('attempts token refresh on 401 and retries the request', async () => {
    // First call: 401
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, 401));
    // Refresh call: success
    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse({ token: 'new-token', refreshToken: 'new-refresh' })
    );
    // Retry call: success
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ items: ['a', 'b'] }));

    const { data, error } = await apiClient.get('/events');

    // Should have made 3 fetch calls: original, refresh, retry
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    expect(data).toEqual({ items: ['a', 'b'] });
    expect(error).toBeNull();

    // Verify refresh endpoint was called
    const refreshCall = globalThis.fetch.mock.calls[1];
    expect(refreshCall[0]).toContain('/auth/refresh');
  });

  it('sends refresh token in the refresh request body', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, 401));
    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse({ accessToken: 'new-token', refreshToken: 'new-refresh' })
    );
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ items: [] }));

    await apiClient.get('/events');

    const [, refreshOpts] = globalThis.fetch.mock.calls[1];
    const body = JSON.parse(refreshOpts.body);
    expect(body.refreshToken).toBe('test-refresh-token');
  });

  it('updates auth state with new tokens after successful refresh', async () => {
    // The refresh endpoint mirrors /auth/login — it returns `accessToken`,
    // not `token`. The client reads result.accessToken; feeding `token` in
    // the mock is a contract drift that silently leaves the store stale.
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, 401));
    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse({ accessToken: 'refreshed-token', refreshToken: 'refreshed-refresh' })
    );
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ items: [] }));

    await apiClient.get('/events');

    const state = authState.get();
    expect(state.token).toBe('refreshed-token');
    expect(state.refreshToken).toBe('refreshed-refresh');
  });

  it('retries with the new token after refresh', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, 401));
    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse({ accessToken: 'refreshed-token', refreshToken: 'refreshed-refresh' })
    );
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await apiClient.get('/events');

    const [, retryOpts] = globalThis.fetch.mock.calls[2];
    expect(retryOpts.headers['Authorization']).toBe('Bearer refreshed-token');
  });

  it('logs out and returns error when refresh fails', async () => {
    // Mock window.location for the redirect
    const origLocation = globalThis.window?.location;
    delete globalThis.window;
    globalThis.window = { location: { href: '' } };

    // First call: 401
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, 401));
    // Refresh call: also fails
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ message: 'Invalid refresh' }, 401));

    const { data, error } = await apiClient.get('/events');

    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect(error.status).toBe(401);
    expect(error.message).toContain('Session expired');

    // Auth state should be cleared
    expect(authState.isAuthenticated).toBe(false);

    // Restore
    if (origLocation) {
      globalThis.window = { location: origLocation };
    }
  });
});
