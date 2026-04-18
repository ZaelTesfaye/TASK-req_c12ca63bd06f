/**
 * Navigation items and route guard logic for the Hospitality Operations Management System.
 *
 * Extracted from +layout.svelte so it can be tested independently.
 * Permission codes are imported from the shared constants module so this
 * table stays in lockstep with the runtime layout and with backend
 * permission enforcement — do not hardcode strings here.
 */

import {
  EVENT_READ,
  EVENT_CREATE,
  EVENT_APPROVE,
  EVENT_SERVICE,
  RESERVATION_REQUEST,
  RECIPE_CREATE,
  INVENTORY_READ,
  ENTITLEMENT_REDEEM,
  REPORTS_EXPORT,
  ADMIN_ROLES,
} from '../constants/permissions.js';

/**
 * Application navigation items with their required permissions.
 * Items with an empty permissions array are visible to all authenticated users.
 */
export const navItems = [
  { route: '/', label: 'Dashboard', permissions: [] },
  { route: '/events', label: 'Events', permissions: [EVENT_READ] },
  { route: '/approvals', label: 'Approvals', permissions: [EVENT_APPROVE] },
  { route: '/reservations', label: 'Reservations', permissions: [RESERVATION_REQUEST] },
  { route: '/recipes', label: 'Recipes', permissions: [RECIPE_CREATE] },
  { route: '/inventory', label: 'Inventory', permissions: [INVENTORY_READ] },
  { route: '/entitlements', label: 'Entitlements', permissions: [ENTITLEMENT_REDEEM] },
  { route: '/check-in', label: 'Check-In', permissions: [EVENT_SERVICE] },
  { route: '/catalog', label: 'Catalog', permissions: [EVENT_CREATE] },
  { route: '/reports', label: 'Reports', permissions: [REPORTS_EXPORT] },
  { route: '/admin', label: 'Admin', permissions: [ADMIN_ROLES] }
];

/**
 * Paths that do not require authentication.
 */
export const PUBLIC_PATHS = ['/login', '/register', '/forgot-password', '/reset-password'];

/**
 * Filter navigation items based on the user's permissions.
 * Items with no required permissions are always visible.
 *
 * @param {string[]} [userPermissions=[]] - Permissions the current user has.
 * @returns {Array} Visible navigation items.
 */
export function getVisibleNavItems(userPermissions = []) {
  return navItems.filter(item => {
    if (item.permissions.length === 0) return true;
    return item.permissions.some(p => userPermissions.includes(p));
  });
}

/**
 * Determine whether a user should be redirected to the login page.
 *
 * @param {boolean} isAuthenticated - Whether the user is authenticated.
 * @param {string} currentPath - The current URL path.
 * @returns {boolean} True if a redirect to /login should occur.
 */
export function shouldRedirectToLogin(isAuthenticated, currentPath) {
  if (!isAuthenticated && !PUBLIC_PATHS.some(p => currentPath.startsWith(p))) {
    return true;
  }
  return false;
}
