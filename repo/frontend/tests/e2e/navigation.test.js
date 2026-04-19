/**
 * E2E tests for navigation and session management.
 *
 * Uses Playwright with API route interception so no real backend is needed.
 */
import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Set up authenticated session with specified role and permissions. */
async function setupAuth(page, { role = 'admin', permissions = null } = {}) {
  const defaultPermissions = {
    admin: [
      'event:read', 'event:create', 'event:update', 'event:submit',
      'event:approve', 'event:service', 'event:close',
      'reservation:request', 'recipe:create', 'inventory:read',
      'entitlement:redeem', 'reports:export', 'admin:roles'
    ],
    event_planner: ['event:read', 'event:create', 'event:submit'],
    service_staff: ['entitlement:redeem', 'event:read', 'event:service']
  };

  const perms = permissions || defaultPermissions[role] || [];

  await page.addInitScript(({ perms, role }) => {
    sessionStorage.setItem('hops_auth', JSON.stringify({
      user: { id: 'u1', email: 'test@example.com', name: 'Test User', roles: [role] },
      token: 'mock-token',
      refreshToken: 'mock-refresh',
      permissions: perms,
      roles: [role]
    }));
  }, { perms, role });
}

/** Mock all dashboard-related API calls so pages load without errors. */
async function setupDashboardAPIs(page) {
  await page.route('**/api/events**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], pagination: { page: 1, total: 0, totalPages: 0 } })
    });
  });
  await page.route('**/api/approvals/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], pagination: { page: 1, total: 0, totalPages: 0 } })
    });
  });
  await page.route('**/api/reservations**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], pagination: { page: 1, total: 0, totalPages: 0 } })
    });
  });
  await page.route('**/api/inventory/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], pagination: { page: 1, total: 0, totalPages: 0 } })
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Navigation', () => {
  test('unauthenticated user is redirected to /login', async ({ page }) => {
    // Do NOT set auth in sessionStorage
    await page.goto('/dashboard');

    // Should redirect to login
    await page.waitForURL('**/login**', { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });

  test('event planner sees limited navigation (no Admin, no Approvals)', async ({ page }) => {
    await setupAuth(page, { role: 'event_planner' });
    await setupDashboardAPIs(page);

    await page.goto('/dashboard');

    const nav = page.locator('nav[aria-label="Main navigation"]');
    await expect(nav).toBeVisible({ timeout: 10000 });

    // Should see Dashboard, Events, Catalog
    await expect(nav.locator('text=Dashboard')).toBeVisible();
    await expect(nav.locator('text=Events')).toBeVisible();
    await expect(nav.locator('text=Catalog')).toBeVisible();

    // Should NOT see Admin, Approvals, Reports, Inventory
    await expect(nav.locator('a:has-text("Admin")')).toHaveCount(0);
    await expect(nav.locator('a:has-text("Approvals")')).toHaveCount(0);
    await expect(nav.locator('a:has-text("Reports")')).toHaveCount(0);
    await expect(nav.locator('a:has-text("Inventory")')).toHaveCount(0);
  });

  test('role-based navigation hides items for service staff', async ({ page }) => {
    await setupAuth(page, { role: 'service_staff' });
    await setupDashboardAPIs(page);

    await page.goto('/dashboard');

    const nav = page.locator('nav[aria-label="Main navigation"]');
    await expect(nav).toBeVisible({ timeout: 10000 });

    // Service staff with entitlement:redeem + event:read
    await expect(nav.locator('text=Dashboard')).toBeVisible();
    await expect(nav.locator('text=Events')).toBeVisible();
    await expect(nav.locator('text=Entitlements')).toBeVisible();
    await expect(nav.locator('text=Check-In')).toBeVisible();

    // Should NOT see admin-only items
    await expect(nav.locator('a:has-text("Admin")')).toHaveCount(0);
    await expect(nav.locator('a:has-text("Reports")')).toHaveCount(0);
    await expect(nav.locator('a:has-text("Recipes")')).toHaveCount(0);
  });

});
