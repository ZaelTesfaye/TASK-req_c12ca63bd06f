/**
 * Unit tests for the auth state store.
 * Source: src/lib/stores/auth.js
 *
 * Tests the ACTUAL production exports: authState and authStore.
 * Verifies all methods: get(), login(), logout(), refresh(), update(),
 * hasPermission(), hasAllPermissions(), hasAnyPermission(), hasRole(),
 * subscribe(), and the isAuthenticated getter.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock sessionStorage before importing the module
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

// Assign to global so the module sees it
Object.defineProperty(globalThis, 'sessionStorage', {
  value: mockSessionStorage,
  writable: true,
  configurable: true
});

// Dynamic import to ensure sessionStorage mock is in place
let authState;
let authStore;
beforeEach(async () => {
  // Clear storage state
  mockSessionStorage.clear();
  mockSessionStorage.getItem.mockClear();
  mockSessionStorage.setItem.mockClear();
  mockSessionStorage.removeItem.mockClear();

  // Re-import fresh module each time
  vi.resetModules();
  const mod = await import('../../src/lib/stores/auth.js');
  authState = mod.authState;
  authStore = mod.authStore;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('authState', () => {
  describe('module exports', () => {
    it('exports authState', () => {
      expect(authState).toBeDefined();
    });

    it('exports authStore as alias for authState', () => {
      expect(authStore).toBe(authState);
    });

    it('authState has all expected methods', () => {
      expect(typeof authState.get).toBe('function');
      expect(typeof authState.login).toBe('function');
      expect(typeof authState.logout).toBe('function');
      expect(typeof authState.refresh).toBe('function');
      expect(typeof authState.update).toBe('function');
      expect(typeof authState.hasPermission).toBe('function');
      expect(typeof authState.hasAllPermissions).toBe('function');
      expect(typeof authState.hasAnyPermission).toBe('function');
      expect(typeof authState.hasRole).toBe('function');
      expect(typeof authState.subscribe).toBe('function');
    });
  });

  describe('initial state', () => {
    it('has null user initially', () => {
      const state = authState.get();
      expect(state.user).toBeNull();
    });

    it('has null token initially', () => {
      const state = authState.get();
      expect(state.token).toBeNull();
    });

    it('has null refreshToken initially', () => {
      const state = authState.get();
      expect(state.refreshToken).toBeNull();
    });

    it('has empty permissions array initially', () => {
      const state = authState.get();
      expect(state.permissions).toEqual([]);
    });

    it('has empty roles array initially', () => {
      const state = authState.get();
      expect(state.roles).toEqual([]);
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

    it('uses provided roles when both roles and user.roles exist', () => {
      authState.login({
        user: { id: 'u2', email: 'x@y.com', name: 'X', roles: ['event_planner'] },
        token: 'tok',
        refreshToken: 'rtok',
        permissions: [],
        roles: ['admin']
      });
      expect(authState.get().roles).toEqual(['admin']);
    });

    it('defaults permissions to empty array if not provided', () => {
      authState.login({
        user: { id: 'u2', email: 'x@y.com', name: 'X', roles: [] },
        token: 'tok',
        refreshToken: 'rtok'
      });
      expect(authState.get().permissions).toEqual([]);
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

    it('updates isAuthenticated based on new token', () => {
      authState.login({
        user: { id: 'u1', email: 'a@b.com', name: 'A', roles: [] },
        token: 'old-token',
        refreshToken: 'old-refresh'
      });

      authState.refresh('new-token', 'new-refresh');
      expect(authState.isAuthenticated).toBe(true);
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

    it('can update user profile', () => {
      authState.login({
        user: { id: 'u1', email: 'old@b.com', name: 'Old Name', roles: [] },
        token: 'tok',
        refreshToken: 'rtok'
      });

      authState.update({ user: { id: 'u1', email: 'new@b.com', name: 'New Name', roles: [] } });

      expect(authState.get().user.email).toBe('new@b.com');
      expect(authState.get().user.name).toBe('New Name');
      expect(authState.get().token).toBe('tok');
    });

    it('persists updates to sessionStorage', () => {
      authState.login({
        user: { id: 'u1', email: 'a@b.com', name: 'A', roles: [] },
        token: 'tok',
        refreshToken: 'rtok'
      });
      mockSessionStorage.setItem.mockClear();

      authState.update({ permissions: ['new:perm'] });
      expect(mockSessionStorage.setItem).toHaveBeenCalled();
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

    it('returns false when no permissions are set', () => {
      authState.logout();
      expect(authState.hasPermission('event:read')).toBe(false);
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

    it('returns false when no roles are set', () => {
      authState.logout();
      expect(authState.hasRole('admin')).toBe(false);
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

    it('returns true when all permissions match', () => {
      expect(authState.hasAnyPermission(['event:read', 'inventory:read'])).toBe(true);
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

    it('returns true for single permission that exists', () => {
      expect(authState.hasAllPermissions(['event:read'])).toBe(true);
    });

    it('returns false when some permissions are missing', () => {
      expect(authState.hasAllPermissions(['event:read', 'admin:roles'])).toBe(false);
    });

    it('returns true for empty array (vacuous truth)', () => {
      expect(authState.hasAllPermissions([])).toBe(true);
    });
  });

  describe('get()', () => {
    it('returns current state as a snapshot', () => {
      const state = authState.get();
      expect(state).toHaveProperty('user');
      expect(state).toHaveProperty('token');
      expect(state).toHaveProperty('refreshToken');
      expect(state).toHaveProperty('permissions');
      expect(state).toHaveProperty('roles');
    });

    it('reflects latest state after mutations', () => {
      authState.login({
        user: { id: 'u1', email: 'a@b.com', name: 'A', roles: [] },
        token: 'tok1',
        refreshToken: 'rtok1',
        permissions: ['event:read'],
        roles: ['admin']
      });

      let state = authState.get();
      expect(state.token).toBe('tok1');

      authState.logout();
      state = authState.get();
      expect(state.token).toBeNull();
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
      // Should NOT have been called after unsubscribe
      expect(fn).not.toHaveBeenCalled();
    });

    it('supports multiple subscribers', () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      authState.subscribe(fn1);
      authState.subscribe(fn2);
      fn1.mockClear();
      fn2.mockClear();

      authState.login({
        user: { id: 'u1', email: 'a@b.com', name: 'A', roles: [] },
        token: 'tok',
        refreshToken: 'rtok'
      });

      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
    });

    it('unsubscribe only affects the specific subscriber', () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      const unsub1 = authState.subscribe(fn1);
      authState.subscribe(fn2);
      fn1.mockClear();
      fn2.mockClear();

      unsub1();

      authState.login({
        user: { id: 'u1', email: 'a@b.com', name: 'A', roles: [] },
        token: 'tok',
        refreshToken: 'rtok'
      });

      expect(fn1).not.toHaveBeenCalled();
      expect(fn2).toHaveBeenCalledTimes(1);
    });
  });

  describe('session persistence', () => {
    it('reads from sessionStorage on module load', () => {
      expect(mockSessionStorage.getItem).toHaveBeenCalledWith('hops_auth');
    });

    it('restores state from sessionStorage if data exists', async () => {
      const savedState = {
        user: { id: 'u1', email: 'a@b.com', name: 'A', roles: ['admin'] },
        token: 'saved-token',
        refreshToken: 'saved-refresh',
        permissions: ['event:read'],
        roles: ['admin']
      };
      storage['hops_auth'] = JSON.stringify(savedState);

      vi.resetModules();
      const mod = await import('../../src/lib/stores/auth.js');
      const restoredState = mod.authState.get();

      expect(restoredState.token).toBe('saved-token');
      expect(restoredState.user.id).toBe('u1');
      expect(restoredState.permissions).toEqual(['event:read']);
      expect(mod.authState.isAuthenticated).toBe(true);

      // Cleanup
      delete storage['hops_auth'];
    });
  });
});
