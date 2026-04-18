/**
 * Authentication state management for the Hospitality Operations Management System.
 *
 * Uses a class-based reactive approach compatible with Svelte 5 runes.
 * Tokens are stored in sessionStorage for persistence across page reloads
 * within the same tab, but NOT in localStorage (security consideration).
 */

const SESSION_KEY = 'hops_auth';

/**
 * @typedef {object} AuthUser
 * @property {string} id
 * @property {string} email
 * @property {string} name
 * @property {string[]} roles
 */

/**
 * @typedef {object} AuthData
 * @property {AuthUser|null} user
 * @property {string|null} token
 * @property {string|null} refreshToken
 * @property {string[]} permissions
 * @property {string[]} roles
 */

/**
 * Try to restore auth state from sessionStorage.
 * @returns {AuthData}
 */
function restoreFromSession() {
  const empty = { user: null, token: null, refreshToken: null, permissions: [], roles: [] };
  if (typeof sessionStorage === 'undefined') return empty;

  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (!stored) return empty;
    const parsed = JSON.parse(stored);
    return {
      user: parsed.user || null,
      token: parsed.token || null,
      refreshToken: parsed.refreshToken || null,
      permissions: Array.isArray(parsed.permissions) ? parsed.permissions : [],
      roles: Array.isArray(parsed.roles) ? parsed.roles : []
    };
  } catch {
    return empty;
  }
}

/**
 * Persist auth state to sessionStorage.
 * @param {AuthData} state
 */
function persistToSession(state) {
  if (typeof sessionStorage === 'undefined') return;

  try {
    if (!state.token) {
      sessionStorage.removeItem(SESSION_KEY);
    } else {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
    }
  } catch {
    // sessionStorage may be unavailable in some contexts
  }
}

/**
 * Create the auth state manager.
 * Exposes a simple API for reading/writing auth state,
 * usable from both Svelte 5 components (via import) and plain JS modules.
 */
function createAuthState() {
  let _state = restoreFromSession();
  let _subscribers = new Set();

  function notify() {
    for (const fn of _subscribers) {
      fn(_state);
    }
  }

  return {
    /**
     * Get the current auth state snapshot.
     * @returns {AuthData}
     */
    get() {
      return _state;
    },

    /**
     * Subscribe to state changes.
     * @param {(state: AuthData) => void} fn
     * @returns {() => void} Unsubscribe function.
     */
    subscribe(fn) {
      _subscribers.add(fn);
      fn(_state);
      return () => _subscribers.delete(fn);
    },

    /**
     * Log in with the given auth response data.
     * @param {object} params
     * @param {AuthUser} params.user
     * @param {string} params.token
     * @param {string} params.refreshToken
     * @param {string[]} [params.permissions]
     * @param {string[]} [params.roles]
     */
    login({ user, token, refreshToken, permissions = [], roles = [] }) {
      _state = {
        user,
        token,
        refreshToken,
        permissions,
        roles: roles.length > 0 ? roles : (user?.roles || [])
      };
      persistToSession(_state);
      notify();
    },

    /**
     * Clear auth state and remove from session.
     */
    logout() {
      _state = { user: null, token: null, refreshToken: null, permissions: [], roles: [] };
      persistToSession(_state);
      notify();
    },

    /**
     * Update tokens after a refresh (keep user/permissions intact).
     * @param {string} token - New access token.
     * @param {string} refreshToken - New refresh token.
     */
    refresh(token, refreshToken) {
      _state = { ..._state, token, refreshToken };
      persistToSession(_state);
      notify();
    },

    /**
     * Update user profile or permissions without changing tokens.
     * @param {Partial<AuthData>} updates
     */
    update(updates) {
      _state = { ..._state, ...updates };
      persistToSession(_state);
      notify();
    },

    /**
     * Check if the user is authenticated (has a token).
     * @returns {boolean}
     */
    get isAuthenticated() {
      return !!_state.token;
    },

    /**
     * Check if the current user has a specific permission.
     * @param {string} permission - Permission code to check.
     * @returns {boolean}
     */
    hasPermission(permission) {
      return _state.permissions.includes(permission);
    },

    /**
     * Check if the current user has ALL of the specified permissions.
     * @param {string[]} permissions - Permission codes to check.
     * @returns {boolean}
     */
    hasAllPermissions(permissions) {
      return permissions.every((p) => _state.permissions.includes(p));
    },

    /**
     * Check if the current user has ANY of the specified permissions.
     * @param {string[]} permissions - Permission codes to check.
     * @returns {boolean}
     */
    hasAnyPermission(permissions) {
      return permissions.some((p) => _state.permissions.includes(p));
    },

    /**
     * Check if the current user has a specific role.
     * @param {string} role - Role name to check.
     * @returns {boolean}
     */
    hasRole(role) {
      return _state.roles.includes(role);
    }
  };
}

/**
 * Singleton auth state instance.
 */
export const authState = createAuthState();

// Alias for backward-compatibility with components that import authStore
export const authStore = authState;
