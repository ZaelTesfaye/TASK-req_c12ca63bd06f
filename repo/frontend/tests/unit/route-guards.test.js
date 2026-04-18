/**
 * Unit tests for route guard / navigation logic.
 *
 * Tests the navigation module (src/lib/utils/navigation.js) which provides
 * permission-based nav filtering and route guard redirect logic used in
 * the application layout.
 */
import { describe, it, expect } from 'vitest';
import {
  navItems,
  PUBLIC_PATHS,
  getVisibleNavItems,
  shouldRedirectToLogin
} from '../../src/lib/utils/navigation.js';

// ---------------------------------------------------------------------------
// Tests - navItems data integrity
// ---------------------------------------------------------------------------
describe('navItems', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(navItems)).toBe(true);
    expect(navItems.length).toBeGreaterThan(0);
  });

  it('each item has route, label, and permissions', () => {
    for (const item of navItems) {
      expect(typeof item.route).toBe('string');
      expect(typeof item.label).toBe('string');
      expect(Array.isArray(item.permissions)).toBe(true);
    }
  });

  it('contains a Dashboard item with no required permissions', () => {
    const dashboard = navItems.find(n => n.route === '/');
    expect(dashboard).toBeDefined();
    expect(dashboard.label).toBe('Dashboard');
    expect(dashboard.permissions).toEqual([]);
  });

  it('contains all expected routes', () => {
    const routes = navItems.map(n => n.route);
    expect(routes).toContain('/');
    expect(routes).toContain('/events');
    expect(routes).toContain('/approvals');
    expect(routes).toContain('/reservations');
    expect(routes).toContain('/recipes');
    expect(routes).toContain('/inventory');
    expect(routes).toContain('/entitlements');
    expect(routes).toContain('/check-in');
    expect(routes).toContain('/catalog');
    expect(routes).toContain('/reports');
    expect(routes).toContain('/admin');
  });
});

// ---------------------------------------------------------------------------
// Tests - PUBLIC_PATHS
// ---------------------------------------------------------------------------
describe('PUBLIC_PATHS', () => {
  it('is a non-empty array of strings', () => {
    expect(Array.isArray(PUBLIC_PATHS)).toBe(true);
    expect(PUBLIC_PATHS.length).toBeGreaterThan(0);
    for (const p of PUBLIC_PATHS) {
      expect(typeof p).toBe('string');
    }
  });

  it('includes /login and /register', () => {
    expect(PUBLIC_PATHS).toContain('/login');
    expect(PUBLIC_PATHS).toContain('/register');
  });

  it('includes password recovery paths', () => {
    expect(PUBLIC_PATHS).toContain('/forgot-password');
    expect(PUBLIC_PATHS).toContain('/reset-password');
  });
});

// ---------------------------------------------------------------------------
// Tests - Route guard redirects
// ---------------------------------------------------------------------------
describe('shouldRedirectToLogin', () => {
  it('returns false for authenticated users on protected routes', () => {
    expect(shouldRedirectToLogin(true, '/dashboard')).toBe(false);
    expect(shouldRedirectToLogin(true, '/events')).toBe(false);
    expect(shouldRedirectToLogin(true, '/admin')).toBe(false);
  });

  it('returns false for authenticated users on public routes', () => {
    expect(shouldRedirectToLogin(true, '/login')).toBe(false);
    expect(shouldRedirectToLogin(true, '/register')).toBe(false);
  });

  it('returns true for unauthenticated users on protected routes', () => {
    expect(shouldRedirectToLogin(false, '/dashboard')).toBe(true);
    expect(shouldRedirectToLogin(false, '/events')).toBe(true);
    expect(shouldRedirectToLogin(false, '/admin')).toBe(true);
    expect(shouldRedirectToLogin(false, '/')).toBe(true);
  });

  it('returns false for unauthenticated users on public paths', () => {
    expect(shouldRedirectToLogin(false, '/login')).toBe(false);
    expect(shouldRedirectToLogin(false, '/register')).toBe(false);
    expect(shouldRedirectToLogin(false, '/forgot-password')).toBe(false);
    expect(shouldRedirectToLogin(false, '/reset-password')).toBe(false);
  });

  it('handles path prefixes correctly (sub-paths of public paths)', () => {
    expect(shouldRedirectToLogin(false, '/login?redirect=/events')).toBe(false);
    expect(shouldRedirectToLogin(false, '/reset-password/abc123')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests - Navigation visibility
// ---------------------------------------------------------------------------
describe('getVisibleNavItems', () => {
  it('user without any permissions sees only Dashboard', () => {
    const visible = getVisibleNavItems([]);
    expect(visible).toHaveLength(1);
    expect(visible[0].label).toBe('Dashboard');
  });

  it('user with event:read sees Dashboard and Events', () => {
    const visible = getVisibleNavItems(['event:read']);
    const labels = visible.map(v => v.label);
    expect(labels).toContain('Dashboard');
    expect(labels).toContain('Events');
    expect(labels).not.toContain('Admin');
    expect(labels).not.toContain('Approvals');
    expect(labels).not.toContain('Reports');
  });

  it('admin with all nav permissions sees all items', () => {
    const allPerms = [
      'event:read',
      'event:approve',
      'event:service',
      'reservation:request',
      'recipe:create',
      'inventory:read',
      'entitlement:redeem',
      'event:create',
      'reports:export',
      'admin:roles'
    ];
    const visible = getVisibleNavItems(allPerms);
    expect(visible).toHaveLength(navItems.length);

    const labels = visible.map(v => v.label);
    expect(labels).toContain('Dashboard');
    expect(labels).toContain('Events');
    expect(labels).toContain('Approvals');
    expect(labels).toContain('Reservations');
    expect(labels).toContain('Recipes');
    expect(labels).toContain('Inventory');
    expect(labels).toContain('Entitlements');
    expect(labels).toContain('Check-In');
    expect(labels).toContain('Catalog');
    expect(labels).toContain('Reports');
    expect(labels).toContain('Admin');
  });

  it('event planner sees limited navigation', () => {
    const plannerPerms = ['event:create', 'event:read', 'event:submit'];
    const visible = getVisibleNavItems(plannerPerms);
    const labels = visible.map(v => v.label);

    expect(labels).toContain('Dashboard');
    expect(labels).toContain('Events');
    expect(labels).toContain('Catalog');
    expect(labels).not.toContain('Admin');
    expect(labels).not.toContain('Approvals');
    expect(labels).not.toContain('Reports');
    expect(labels).not.toContain('Inventory');
  });

  it('approver sees Approvals nav item', () => {
    const approverPerms = ['event:read', 'event:approve'];
    const visible = getVisibleNavItems(approverPerms);
    const labels = visible.map(v => v.label);

    expect(labels).toContain('Approvals');
    expect(labels).toContain('Events');
    expect(labels).not.toContain('Admin');
  });

  it('Dashboard is always visible regardless of permissions', () => {
    const visible = getVisibleNavItems([]);
    expect(visible.some(v => v.label === 'Dashboard')).toBe(true);
  });

  it('entitlement:redeem grants access to Entitlements but NOT Check-In', () => {
    // Check-In requires event:service (matching the backend authorize()
    // gate on POST /events/:id/check-in). A caller who only holds
    // entitlement:redeem must not see the Check-In nav item.
    const visible = getVisibleNavItems(['entitlement:redeem']);
    const labels = visible.map(v => v.label);

    expect(labels).toContain('Entitlements');
    expect(labels).not.toContain('Check-In');
  });

  it('event:service grants access to Check-In', () => {
    const visible = getVisibleNavItems(['event:service']);
    const labels = visible.map(v => v.label);

    expect(labels).toContain('Check-In');
  });

  it('defaults to empty array when called with no arguments', () => {
    const visible = getVisibleNavItems();
    expect(visible).toHaveLength(1);
    expect(visible[0].label).toBe('Dashboard');
  });
});
