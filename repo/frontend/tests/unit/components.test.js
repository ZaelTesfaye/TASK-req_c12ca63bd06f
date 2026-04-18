/**
 * Component-level tests for the Hospitality Operations Management System.
 *
 * Since Svelte 5 component rendering in jsdom is complex, these tests focus on
 * the exported module-level logic from the auth store and API client - the two
 * key non-component modules that drive application behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock sessionStorage before importing modules
// ---------------------------------------------------------------------------
const storage = {};
const mockSessionStorage = {
  getItem: vi.fn((key) => storage[key] ?? null),
  setItem: vi.fn((key, value) => {
    storage[key] = value;
  }),
  removeItem: vi.fn((key) => {
    delete storage[key];
  }),
  clear: vi.fn(() => {
    for (const key of Object.keys(storage)) delete storage[key];
  })
};

Object.defineProperty(globalThis, 'sessionStorage', {
  value: mockSessionStorage,
  writable: true,
  configurable: true
});

// ---------------------------------------------------------------------------
// Helpers for mocking fetch responses
// ---------------------------------------------------------------------------
function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => {
        if (name.toLowerCase() === 'content-type') return 'application/json';
        return null;
      }
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body))
  };
}

// ============================================================================
// AUTH STORE TESTS
// ============================================================================
describe('Auth Store (authState)', () => {
  let authState;
  let authStore;

  beforeEach(async () => {
    mockSessionStorage.clear();
    mockSessionStorage.getItem.mockClear();
    mockSessionStorage.setItem.mockClear();
    mockSessionStorage.removeItem.mockClear();

    vi.resetModules();
    const mod = await import('../../src/lib/stores/auth.js');
    authState = mod.authState;
    authStore = mod.authStore;
  });

  describe('exports', () => {
    it('exports authState as the primary store', () => {
      expect(authState).toBeDefined();
      expect(typeof authState.get).toBe('function');
      expect(typeof authState.login).toBe('function');
      expect(typeof authState.logout).toBe('function');
    });

    it('exports authStore as an alias for authState', () => {
      expect(authStore).toBe(authState);
    });
  });

  describe('initial state', () => {
    it('has null user initially', () => {
      expect(authState.get().user).toBeNull();
    });

    it('has null token initially', () => {
      expect(authState.get().token).toBeNull();
    });

    it('has null refreshToken initially', () => {
      expect(authState.get().refreshToken).toBeNull();
    });

    it('has empty permissions array initially', () => {
      expect(authState.get().permissions).toEqual([]);
    });

    it('has empty roles array initially', () => {
      expect(authState.get().roles).toEqual([]);
    });

    it('isAuthenticated is false initially', () => {
      expect(authState.isAuthenticated).toBe(false);
    });
  });

  describe('login()', () => {
    const loginData = {
      user: { id: 'u1', email: 'test@example.com', name: 'Test User', roles: ['admin'] },
      token: 'access-token-123',
      refreshToken: 'refresh-token-456',
      permissions: ['event:create', 'event:read', 'admin:roles'],
      roles: ['admin']
    };

    it('sets user after login', () => {
      authState.login(loginData);
      expect(authState.get().user).toEqual(loginData.user);
    });

    it('sets token after login', () => {
      authState.login(loginData);
      expect(authState.get().token).toBe('access-token-123');
    });

    it('sets refreshToken after login', () => {
      authState.login(loginData);
      expect(authState.get().refreshToken).toBe('refresh-token-456');
    });

    it('sets roles after login', () => {
      authState.login(loginData);
      expect(authState.get().roles).toEqual(['admin']);
    });

    it('sets permissions after login', () => {
      authState.login(loginData);
      expect(authState.get().permissions).toEqual(['event:create', 'event:read', 'admin:roles']);
    });

    it('isAuthenticated is true after login', () => {
      authState.login(loginData);
      expect(authState.isAuthenticated).toBe(true);
    });

    it('persists to sessionStorage', () => {
      authState.login(loginData);
      expect(mockSessionStorage.setItem).toHaveBeenCalled();
    });

    it('falls back to user.roles when roles param is empty', () => {
      authState.login({
        user: { id: 'u2', email: 'x@y.com', name: 'X', roles: ['event_planner'] },
        token: 'tok',
        refreshToken: 'rtok',
        permissions: [],
        roles: []
      });
      expect(authState.get().roles).toEqual(['event_planner']);
    });
  });

  describe('logout()', () => {
    it('clears all state', () => {
      authState.login({
        user: { id: 'u1', email: 'a@b.com', name: 'A', roles: ['admin'] },
        token: 'tok',
        refreshToken: 'rtok',
        permissions: ['event:read'],
        roles: ['admin']
      });

      authState.logout();

      const state = authState.get();
      expect(state.user).toBeNull();
      expect(state.token).toBeNull();
      expect(state.refreshToken).toBeNull();
      expect(state.permissions).toEqual([]);
      expect(state.roles).toEqual([]);
    });

    it('isAuthenticated is false after logout', () => {
      authState.login({
        user: { id: 'u1', email: 'a@b.com', name: 'A', roles: [] },
        token: 'tok',
        refreshToken: 'rtok'
      });
      authState.logout();
      expect(authState.isAuthenticated).toBe(false);
    });

    it('removes session from sessionStorage', () => {
      authState.login({
        user: { id: 'u1', email: 'a@b.com', name: 'A', roles: [] },
        token: 'tok',
        refreshToken: 'rtok'
      });
      authState.logout();
      expect(mockSessionStorage.removeItem).toHaveBeenCalledWith('hops_auth');
    });
  });

  describe('hasPermission()', () => {
    beforeEach(() => {
      authState.login({
        user: { id: 'u1', email: 'a@b.com', name: 'A', roles: [] },
        token: 'tok',
        refreshToken: 'rtok',
        permissions: ['event:create', 'event:read', 'inventory:read'],
        roles: ['event_planner']
      });
    });

    it('returns true for an existing permission', () => {
      expect(authState.hasPermission('event:create')).toBe(true);
      expect(authState.hasPermission('inventory:read')).toBe(true);
    });

    it('returns false for a non-existing permission', () => {
      expect(authState.hasPermission('admin:roles')).toBe(false);
      expect(authState.hasPermission('budget:override')).toBe(false);
    });
  });

  describe('hasRole()', () => {
    beforeEach(() => {
      authState.login({
        user: { id: 'u1', email: 'a@b.com', name: 'A', roles: [] },
        token: 'tok',
        refreshToken: 'rtok',
        permissions: [],
        roles: ['event_planner', 'approver']
      });
    });

    it('returns true for an existing role', () => {
      expect(authState.hasRole('event_planner')).toBe(true);
      expect(authState.hasRole('approver')).toBe(true);
    });

    it('returns false for a non-existing role', () => {
      expect(authState.hasRole('admin')).toBe(false);
      expect(authState.hasRole('resource_manager')).toBe(false);
    });
  });

  describe('hasAnyPermission()', () => {
    beforeEach(() => {
      authState.login({
        user: { id: 'u1', email: 'a@b.com', name: 'A', roles: [] },
        token: 'tok',
        refreshToken: 'rtok',
        permissions: ['event:read', 'inventory:read'],
        roles: ['event_planner']
      });
    });

    it('returns true when at least one permission matches', () => {
      expect(authState.hasAnyPermission(['event:read', 'admin:roles'])).toBe(true);
    });

    it('returns false when no permissions match', () => {
      expect(authState.hasAnyPermission(['admin:roles', 'budget:override'])).toBe(false);
    });

    it('returns false for empty array', () => {
      expect(authState.hasAnyPermission([])).toBe(false);
    });
  });

  describe('hasAllPermissions()', () => {
    beforeEach(() => {
      authState.login({
        user: { id: 'u1', email: 'a@b.com', name: 'A', roles: [] },
        token: 'tok',
        refreshToken: 'rtok',
        permissions: ['event:read', 'event:create', 'inventory:read'],
        roles: ['event_planner']
      });
    });

    it('returns true when all permissions are present', () => {
      expect(authState.hasAllPermissions(['event:read', 'event:create'])).toBe(true);
    });

    it('returns false when some permissions are missing', () => {
      expect(authState.hasAllPermissions(['event:read', 'admin:roles'])).toBe(false);
    });

    it('returns true for empty array (vacuous truth)', () => {
      expect(authState.hasAllPermissions([])).toBe(true);
    });
  });

  describe('subscribe()', () => {
    it('calls subscriber immediately with current state', () => {
      const fn = vi.fn();
      authState.subscribe(fn);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith(authState.get());
    });

    it('notifies subscriber on login', () => {
      const fn = vi.fn();
      authState.subscribe(fn);
      fn.mockClear();

      authState.login({
        user: { id: 'u1', email: 'a@b.com', name: 'A', roles: [] },
        token: 'tok',
        refreshToken: 'rtok',
        permissions: [],
        roles: []
      });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('notifies subscriber on logout', () => {
      authState.login({
        user: { id: 'u1', email: 'a@b.com', name: 'A', roles: [] },
        token: 'tok',
        refreshToken: 'rtok'
      });

      const fn = vi.fn();
      authState.subscribe(fn);
      fn.mockClear();

      authState.logout();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('notifies subscriber on refresh', () => {
      authState.login({
        user: { id: 'u1', email: 'a@b.com', name: 'A', roles: [] },
        token: 'tok',
        refreshToken: 'rtok'
      });

      const fn = vi.fn();
      authState.subscribe(fn);
      fn.mockClear();

      authState.refresh('new-tok', 'new-rtok');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('notifies subscriber on update', () => {
      authState.login({
        user: { id: 'u1', email: 'a@b.com', name: 'A', roles: [] },
        token: 'tok',
        refreshToken: 'rtok',
        permissions: []
      });

      const fn = vi.fn();
      authState.subscribe(fn);
      fn.mockClear();

      authState.update({ permissions: ['event:read'] });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('returns unsubscribe function', () => {
      const fn = vi.fn();
      const unsub = authState.subscribe(fn);
      fn.mockClear();

      unsub();
      authState.login({
        user: { id: 'u1', email: 'a@b.com', name: 'A', roles: [] },
        token: 'tok',
        refreshToken: 'rtok',
        permissions: [],
        roles: []
      });
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('refresh()', () => {
    it('updates tokens without changing user or permissions', () => {
      authState.login({
        user: { id: 'u1', email: 'a@b.com', name: 'A', roles: [] },
        token: 'old-token',
        refreshToken: 'old-refresh',
        permissions: ['event:read'],
        roles: ['admin']
      });

      authState.refresh('new-token', 'new-refresh');

      const state = authState.get();
      expect(state.token).toBe('new-token');
      expect(state.refreshToken).toBe('new-refresh');
      expect(state.permissions).toEqual(['event:read']);
      expect(state.roles).toEqual(['admin']);
      expect(state.user.id).toBe('u1');
    });

    it('persists refreshed tokens to sessionStorage', () => {
      authState.login({
        user: { id: 'u1', email: 'a@b.com', name: 'A', roles: [] },
        token: 'old-token',
        refreshToken: 'old-refresh'
      });
      mockSessionStorage.setItem.mockClear();

      authState.refresh('new-token', 'new-refresh');
      expect(mockSessionStorage.setItem).toHaveBeenCalled();
    });
  });

  describe('update()', () => {
    it('updates specific fields without replacing entire state', () => {
      authState.login({
        user: { id: 'u1', email: 'a@b.com', name: 'A', roles: [] },
        token: 'tok',
        refreshToken: 'rtok',
        permissions: ['event:read'],
        roles: ['admin']
      });

      authState.update({ permissions: ['event:read', 'event:create'] });

      const state = authState.get();
      expect(state.permissions).toEqual(['event:read', 'event:create']);
      expect(state.token).toBe('tok');
      expect(state.roles).toEqual(['admin']);
    });
  });

  describe('isAuthenticated getter', () => {
    it('returns false when no token', () => {
      expect(authState.isAuthenticated).toBe(false);
    });

    it('returns true when token exists', () => {
      authState.login({
        user: { id: 'u1', email: 'a@b.com', name: 'A', roles: [] },
        token: 'some-token',
        refreshToken: 'rtok'
      });
      expect(authState.isAuthenticated).toBe(true);
    });

    it('returns false after logout', () => {
      authState.login({
        user: { id: 'u1', email: 'a@b.com', name: 'A', roles: [] },
        token: 'some-token',
        refreshToken: 'rtok'
      });
      authState.logout();
      expect(authState.isAuthenticated).toBe(false);
    });
  });
});

// ============================================================================
// API CLIENT TESTS
// ============================================================================
describe('API Client', () => {
  let apiClient;
  let authState;

  beforeEach(async () => {
    vi.resetModules();
    globalThis.fetch = vi.fn();
    vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api');

    mockSessionStorage.clear();
    mockSessionStorage.getItem.mockClear();
    mockSessionStorage.setItem.mockClear();
    mockSessionStorage.removeItem.mockClear();

    const authMod = await import('../../src/lib/stores/auth.js');
    authState = authMod.authState;

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

  describe('get()', () => {
    it('makes a GET request with Authorization header', async () => {
      globalThis.fetch.mockResolvedValueOnce(jsonResponse({ items: [] }));

      await apiClient.get('/events');

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
  });

  describe('post()', () => {
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
  });

  describe('put()', () => {
    it('sends PUT request', async () => {
      globalThis.fetch.mockResolvedValueOnce(jsonResponse({ updated: true }));

      await apiClient.put('/events/1', { title: 'Updated' });

      const [, opts] = globalThis.fetch.mock.calls[0];
      expect(opts.method).toBe('PUT');
    });
  });

  describe('patch()', () => {
    it('sends PATCH request', async () => {
      globalThis.fetch.mockResolvedValueOnce(jsonResponse({ updated: true }));

      await apiClient.patch('/events/1/state', { state: 'approved' });

      const [, opts] = globalThis.fetch.mock.calls[0];
      expect(opts.method).toBe('PATCH');
    });
  });

  describe('del()', () => {
    it('sends DELETE request', async () => {
      globalThis.fetch.mockResolvedValueOnce(jsonResponse(null, 204));

      await apiClient.del('/events/1');

      const [, opts] = globalThis.fetch.mock.calls[0];
      expect(opts.method).toBe('DELETE');
    });
  });

  describe('error handling', () => {
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
  });

  describe('401 and token refresh', () => {
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

      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
      expect(data).toEqual({ items: ['a', 'b'] });
      expect(error).toBeNull();

      const refreshCall = globalThis.fetch.mock.calls[1];
      expect(refreshCall[0]).toContain('/auth/refresh');
    });

    it('logs out and returns error when refresh fails', async () => {
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

      expect(authState.isAuthenticated).toBe(false);

      if (origLocation) {
        globalThis.window = { location: origLocation };
      }
    });
  });

  describe('upload()', () => {
    it('sends FormData without manually setting Content-Type', async () => {
      globalThis.fetch.mockResolvedValueOnce(jsonResponse({ id: 'att-1' }, 201));

      const formData = new FormData();
      formData.append('file', new Blob(['hello'], { type: 'text/plain' }), 'test.txt');

      const { data, error } = await apiClient.upload('/attachments', formData);

      const [url, opts] = globalThis.fetch.mock.calls[0];
      expect(opts.method).toBe('POST');
      expect(opts.headers['Content-Type']).toBeUndefined();
      expect(data).toEqual({ id: 'att-1' });
      expect(error).toBeNull();
    });
  });
});
