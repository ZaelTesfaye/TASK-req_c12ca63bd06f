# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: navigation.test.js >> Navigation >> unauthenticated user is redirected to /login
- Location: tests/e2e/navigation.test.js:75:3

# Error details

```
TimeoutError: page.waitForURL: Timeout 10000ms exceeded.
=========================== logs ===========================
waiting for navigation to "**/login**" until "load"
============================================================
```

# Page snapshot

```yaml
- generic [ref=e2]: "Blocked request. This host (\"frontend\") is not allowed. To allow this host, add \"frontend\" to `server.allowedHosts` in vite.config.js."
```

# Test source

```ts
  1   | /**
  2   |  * E2E tests for navigation and session management.
  3   |  *
  4   |  * Uses Playwright with API route interception so no real backend is needed.
  5   |  */
  6   | import { test, expect } from '@playwright/test';
  7   | 
  8   | // ---------------------------------------------------------------------------
  9   | // Helpers
  10  | // ---------------------------------------------------------------------------
  11  | 
  12  | /** Set up authenticated session with specified role and permissions. */
  13  | async function setupAuth(page, { role = 'admin', permissions = null } = {}) {
  14  |   const defaultPermissions = {
  15  |     admin: [
  16  |       'event:read', 'event:create', 'event:update', 'event:submit',
  17  |       'event:approve', 'event:service', 'event:close',
  18  |       'reservation:request', 'recipe:create', 'inventory:read',
  19  |       'entitlement:redeem', 'reports:export', 'admin:roles'
  20  |     ],
  21  |     event_planner: ['event:read', 'event:create', 'event:submit'],
  22  |     service_staff: ['entitlement:redeem', 'event:read', 'event:service']
  23  |   };
  24  | 
  25  |   const perms = permissions || defaultPermissions[role] || [];
  26  | 
  27  |   await page.addInitScript(({ perms, role }) => {
  28  |     sessionStorage.setItem('hops_auth', JSON.stringify({
  29  |       user: { id: 'u1', email: 'test@example.com', name: 'Test User', roles: [role] },
  30  |       token: 'mock-token',
  31  |       refreshToken: 'mock-refresh',
  32  |       permissions: perms,
  33  |       roles: [role]
  34  |     }));
  35  |   }, { perms, role });
  36  | }
  37  | 
  38  | /** Mock all dashboard-related API calls so pages load without errors. */
  39  | async function setupDashboardAPIs(page) {
  40  |   await page.route('**/api/events**', async (route) => {
  41  |     await route.fulfill({
  42  |       status: 200,
  43  |       contentType: 'application/json',
  44  |       body: JSON.stringify({ data: [], pagination: { page: 1, total: 0, totalPages: 0 } })
  45  |     });
  46  |   });
  47  |   await page.route('**/api/approvals/**', async (route) => {
  48  |     await route.fulfill({
  49  |       status: 200,
  50  |       contentType: 'application/json',
  51  |       body: JSON.stringify({ data: [], pagination: { page: 1, total: 0, totalPages: 0 } })
  52  |     });
  53  |   });
  54  |   await page.route('**/api/reservations**', async (route) => {
  55  |     await route.fulfill({
  56  |       status: 200,
  57  |       contentType: 'application/json',
  58  |       body: JSON.stringify({ data: [], pagination: { page: 1, total: 0, totalPages: 0 } })
  59  |     });
  60  |   });
  61  |   await page.route('**/api/inventory/**', async (route) => {
  62  |     await route.fulfill({
  63  |       status: 200,
  64  |       contentType: 'application/json',
  65  |       body: JSON.stringify({ data: [], pagination: { page: 1, total: 0, totalPages: 0 } })
  66  |     });
  67  |   });
  68  | }
  69  | 
  70  | // ---------------------------------------------------------------------------
  71  | // Tests
  72  | // ---------------------------------------------------------------------------
  73  | 
  74  | test.describe('Navigation', () => {
  75  |   test('unauthenticated user is redirected to /login', async ({ page }) => {
  76  |     // Do NOT set auth in sessionStorage
  77  |     await page.goto('/dashboard');
  78  | 
  79  |     // Should redirect to login
> 80  |     await page.waitForURL('**/login**', { timeout: 10000 });
      |                ^ TimeoutError: page.waitForURL: Timeout 10000ms exceeded.
  81  |     expect(page.url()).toContain('/login');
  82  |   });
  83  | 
  84  |   test('login redirects to dashboard after authentication', async ({ page }) => {
  85  |     // Setup login mock
  86  |     await page.route('**/api/auth/login', async (route) => {
  87  |       await route.fulfill({
  88  |         status: 200,
  89  |         contentType: 'application/json',
  90  |         body: JSON.stringify({
  91  |           user: { id: 'u1', email: 'admin@example.com', name: 'Admin', roles: ['admin'] },
  92  |           accessToken: 'mock-token',
  93  |           refreshToken: 'mock-refresh',
  94  |           permissions: ['event:read', 'admin:roles'],
  95  |           roles: ['admin']
  96  |         })
  97  |       });
  98  |     });
  99  |     await setupDashboardAPIs(page);
  100 | 
  101 |     await page.goto('/login');
  102 |     await page.fill('#username', 'admin');
  103 |     await page.fill('#password', 'password123');
  104 |     await page.click('button[type="submit"]');
  105 | 
  106 |     await page.waitForURL('**/dashboard**', { timeout: 10000 });
  107 |     expect(page.url()).toContain('/dashboard');
  108 |   });
  109 | 
  110 |   test('admin sees all navigation items', async ({ page }) => {
  111 |     await setupAuth(page, { role: 'admin' });
  112 |     await setupDashboardAPIs(page);
  113 | 
  114 |     await page.goto('/dashboard');
  115 | 
  116 |     // Wait for the navigation to render
  117 |     const nav = page.locator('nav[aria-label="Main navigation"]');
  118 |     await expect(nav).toBeVisible({ timeout: 10000 });
  119 | 
  120 |     // Check that all major nav items are visible
  121 |     await expect(nav.locator('text=Dashboard')).toBeVisible();
  122 |     await expect(nav.locator('text=Events')).toBeVisible();
  123 |     await expect(nav.locator('text=Approvals')).toBeVisible();
  124 |     await expect(nav.locator('text=Reservations')).toBeVisible();
  125 |     await expect(nav.locator('text=Recipes')).toBeVisible();
  126 |     await expect(nav.locator('text=Inventory')).toBeVisible();
  127 |     await expect(nav.locator('text=Entitlements')).toBeVisible();
  128 |     await expect(nav.locator('text=Check-In')).toBeVisible();
  129 |     await expect(nav.locator('text=Catalog')).toBeVisible();
  130 |     await expect(nav.locator('text=Reports')).toBeVisible();
  131 |     await expect(nav.locator('text=Admin')).toBeVisible();
  132 |   });
  133 | 
  134 |   test('event planner sees limited navigation (no Admin, no Approvals)', async ({ page }) => {
  135 |     await setupAuth(page, { role: 'event_planner' });
  136 |     await setupDashboardAPIs(page);
  137 | 
  138 |     await page.goto('/dashboard');
  139 | 
  140 |     const nav = page.locator('nav[aria-label="Main navigation"]');
  141 |     await expect(nav).toBeVisible({ timeout: 10000 });
  142 | 
  143 |     // Should see Dashboard, Events, Catalog
  144 |     await expect(nav.locator('text=Dashboard')).toBeVisible();
  145 |     await expect(nav.locator('text=Events')).toBeVisible();
  146 |     await expect(nav.locator('text=Catalog')).toBeVisible();
  147 | 
  148 |     // Should NOT see Admin, Approvals, Reports, Inventory
  149 |     await expect(nav.locator('a:has-text("Admin")')).toHaveCount(0);
  150 |     await expect(nav.locator('a:has-text("Approvals")')).toHaveCount(0);
  151 |     await expect(nav.locator('a:has-text("Reports")')).toHaveCount(0);
  152 |     await expect(nav.locator('a:has-text("Inventory")')).toHaveCount(0);
  153 |   });
  154 | 
  155 |   test('role-based navigation hides items for service staff', async ({ page }) => {
  156 |     await setupAuth(page, { role: 'service_staff' });
  157 |     await setupDashboardAPIs(page);
  158 | 
  159 |     await page.goto('/dashboard');
  160 | 
  161 |     const nav = page.locator('nav[aria-label="Main navigation"]');
  162 |     await expect(nav).toBeVisible({ timeout: 10000 });
  163 | 
  164 |     // Service staff with entitlement:redeem + event:read
  165 |     await expect(nav.locator('text=Dashboard')).toBeVisible();
  166 |     await expect(nav.locator('text=Events')).toBeVisible();
  167 |     await expect(nav.locator('text=Entitlements')).toBeVisible();
  168 |     await expect(nav.locator('text=Check-In')).toBeVisible();
  169 | 
  170 |     // Should NOT see admin-only items
  171 |     await expect(nav.locator('a:has-text("Admin")')).toHaveCount(0);
  172 |     await expect(nav.locator('a:has-text("Reports")')).toHaveCount(0);
  173 |     await expect(nav.locator('a:has-text("Recipes")')).toHaveCount(0);
  174 |   });
  175 | 
  176 |   test('logout clears session and redirects to login', async ({ page }) => {
  177 |     await setupAuth(page, { role: 'admin' });
  178 |     await setupDashboardAPIs(page);
  179 | 
  180 |     await page.goto('/dashboard');
```