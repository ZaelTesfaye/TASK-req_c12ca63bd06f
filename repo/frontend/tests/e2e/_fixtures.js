/**
 * Shared fixture helpers for Playwright e2e tests.
 *
 * The mock shapes here MUST mirror the actual backend response envelopes so
 * that mocked tests don't drift from the live contract. If the backend
 * contract changes, update this file first — every other e2e suite should
 * consume its helpers rather than hand-rolling its own JSON.
 *
 * Contract references:
 *   - POST /auth/login:  { accessToken, refreshToken, expiresIn, user: { id, username, roles, permissions } }
 *   - GET /events/:id:   { data: { ...event, service_windows, materials, resource_requests } }
 *   - GET /events?...:   { data: [...], pagination: { page, pageSize, total, totalPages } }
 *   - POST /events/:id/check-in:  { data: { checkIn, warning, warningMessage?, occupancy } }
 *   - GET  /events/:id/check-in:  { data: { checkIns: [...], occupancy: number } }
 */

/**
 * Build a successful POST /auth/login response body.
 * Uses backend field names (accessToken, refreshToken, user.username).
 */
export function loginResponse({
  userId = 'u1',
  username = 'admin',
  roles = ['admin'],
  permissions = [
    'event:read', 'event:create', 'event:approve', 'event:service',
    'event:close', 'admin:roles', 'reports:export', 'inventory:read',
    'reservation:request', 'recipe:create', 'entitlement:redeem',
  ],
  accessToken = 'mock-access-token',
  refreshToken = 'mock-refresh-token',
  expiresIn = 2700,
} = {}) {
  return {
    accessToken,
    refreshToken,
    expiresIn,
    user: { id: userId, username, roles, permissions },
  };
}

/**
 * Wrap a single-resource payload in the { data: ... } envelope the backend
 * uses for GET /events/:id and similar detail routes.
 */
export function wrapData(payload) {
  return { data: payload };
}

/**
 * Wrap a paginated list payload.
 */
export function wrapPage(rows, { page = 1, pageSize = 20, total = undefined, totalPages = undefined } = {}) {
  const computedTotal = total ?? rows.length;
  const computedPages = totalPages ?? Math.max(1, Math.ceil(computedTotal / pageSize));
  return {
    data: rows,
    pagination: { page, pageSize, total: computedTotal, totalPages: computedPages },
  };
}

/**
 * Pre-populate sessionStorage with the shape the frontend auth store expects.
 * The store keeps the access token internally as `token`, mapped from the
 * backend's `accessToken` at login time.
 */
export async function primeSessionAuth(page, {
  user = { id: 'u1', username: 'admin', name: 'admin', roles: ['admin'] },
  permissions = ['event:read', 'event:create'],
  roles = ['admin'],
  token = 'mock-access-token',
  refreshToken = 'mock-refresh-token',
} = {}) {
  await page.addInitScript(({ user, permissions, roles, token, refreshToken }) => {
    sessionStorage.setItem('hops_auth', JSON.stringify({
      user,
      token,
      refreshToken,
      permissions,
      roles,
    }));
  }, { user, permissions, roles, token, refreshToken });
}
