# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fullstack.spec.js >> Fullstack: entitlement issuance + redemption >> admin issues a manual entitlement to planner, planner redeems it
- Location: tests/e2e/fullstack.spec.js:382:3

# Error details

```
Error: apiRequestContext.post: connect ECONNREFUSED 172.22.0.5:3000
Call log:
  - → POST http://backend:3000/auth/login
    - user-agent: Playwright/1.59.1 (x64; ubuntu 22.04) node/20.9 CI/1
    - accept: */*
    - accept-encoding: gzip,deflate,br
    - content-type: application/json
    - content-length: 43

```

# Test source

```ts
  1   | /**
  2   |  * Fullstack E2E tests — no API mocking.
  3   |  *
  4   |  * These tests drive a real browser against the live SvelteKit frontend AND
  5   |  * the real Fastify backend (both running in Docker on the same compose
  6   |  * network). Unlike the `*.test.js` suites in this folder, NO `page.route`
  7   |  * stubbing is used here.
  8   |  *
  9   |  * Pre-conditions provided by `run_tests.sh`:
  10  |  *   - backend service reachable at http://backend:3000 (within network)
  11  |  *   - frontend service reachable at http://frontend:5173
  12  |  *   - docker-compose.test.yml overrides VITE_API_URL=http://backend:3000
  13  |  *     for the frontend service so that JS running in the Playwright
  14  |  *     browser container resolves the backend via its service hostname.
  15  |  *   - Demo users seeded by NODE_ENV!=production seed (admin/admin123! etc.)
  16  |  */
  17  | import { test, expect, request as pwRequest } from '@playwright/test';
  18  | 
  19  | // ---------------------------------------------------------------------------
  20  | // Helpers
  21  | // ---------------------------------------------------------------------------
  22  | 
  23  | /**
  24  |  * Base URL for direct backend calls from the Playwright runner (Node context,
  25  |  * not the browser). Runs in the same docker network as the backend.
  26  |  */
  27  | const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:3000';
  28  | 
  29  | /**
  30  |  * Log in via the backend REST API and return { accessToken, refreshToken, user }.
  31  |  */
  32  | async function apiLogin(request, username, password) {
> 33  |   const res = await request.post(`${BACKEND_URL}/auth/login`, {
      |                             ^ Error: apiRequestContext.post: connect ECONNREFUSED 172.22.0.5:3000
  34  |     data: { username, password },
  35  |   });
  36  |   expect(res.ok(), `login for ${username} should succeed`).toBeTruthy();
  37  |   return res.json();
  38  | }
  39  | 
  40  | /**
  41  |  * Seed a Playwright page with auth state in sessionStorage before any
  42  |  * navigation occurs. Mirrors the shape the frontend auth store expects.
  43  |  */
  44  | async function primeBrowserAuth(page, loginResponse) {
  45  |   const { accessToken, refreshToken, user } = loginResponse;
  46  |   await page.addInitScript(
  47  |     ({ accessToken, refreshToken, user }) => {
  48  |       sessionStorage.setItem(
  49  |         'hops_auth',
  50  |         JSON.stringify({
  51  |           user: { id: user.id, username: user.username, name: user.username, roles: user.roles },
  52  |           token: accessToken,
  53  |           refreshToken,
  54  |           permissions: user.permissions || [],
  55  |           roles: user.roles || [],
  56  |         }),
  57  |       );
  58  |     },
  59  |     { accessToken, refreshToken, user },
  60  |   );
  61  | }
  62  | 
  63  | /** Make a small unique title so parallel runs don't collide. */
  64  | function uniqueTitle(prefix) {
  65  |   return `${prefix} ${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  66  | }
  67  | 
  68  | /** Produce a YYYY-MM-DD string N days in the future. */
  69  | function futureDate(daysAhead) {
  70  |   const d = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  71  |   return d.toISOString().slice(0, 10);
  72  | }
  73  | 
  74  | /** Produce an ISO-8601 datetime with offset, N days in the future at the given hour. */
  75  | function futureIso(daysAhead, hour) {
  76  |   const d = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  77  |   d.setUTCHours(hour, 0, 0, 0);
  78  |   return d.toISOString();
  79  | }
  80  | 
  81  | // ---------------------------------------------------------------------------
  82  | // A. Login → create event → verify (planner)
  83  | // ---------------------------------------------------------------------------
  84  | 
  85  | test.describe('Fullstack: events module', () => {
  86  |   test('planner logs in, creates an event, and sees it in the list', async ({ page }) => {
  87  |     const title = uniqueTitle('FS Gala');
  88  |     const eventDate = futureDate(30);
  89  | 
  90  |     await page.goto('/login');
  91  |     await page.fill('#username', 'planner');
  92  |     await page.fill('#password', 'planner123!');
  93  |     await page.click('button[type="submit"]');
  94  | 
  95  |     // Land somewhere post-login (dashboard is the default landing).
  96  |     await page.waitForURL(/\/(dashboard|events).*$/, { timeout: 15000 });
  97  | 
  98  |     // Navigate to events list.
  99  |     await page.goto('/events');
  100 |     await expect(page.locator('h1')).toContainText('Events', { timeout: 15000 });
  101 | 
  102 |     // Open create form.
  103 |     await page.click('text=+ Create Event');
  104 |     await page.waitForURL('**/events/new**', { timeout: 10000 });
  105 | 
  106 |     // Fill required fields. Budget under $25k cap.
  107 |     await page.fill('input[placeholder="Event title"]', title);
  108 |     await page.fill('input[type="date"]', eventDate);
  109 |     await page.fill('input[type="number"][min="1"]', '75');
  110 |     await page.fill('input[type="number"][min="0"]', '5000');
  111 | 
  112 |     await page.click('button[type="submit"]');
  113 | 
  114 |     // Land on the event detail page (UUID in URL).
  115 |     await page.waitForURL(/\/events\/[0-9a-f-]{36}$/i, { timeout: 15000 });
  116 |     await expect(page.locator('h1')).toContainText(title, { timeout: 15000 });
  117 | 
  118 |     // Go back to the list and verify the new title appears.
  119 |     await page.goto('/events');
  120 |     await expect(page.locator(`text=${title}`).first()).toBeVisible({ timeout: 15000 });
  121 |   });
  122 | });
  123 | 
  124 | // ---------------------------------------------------------------------------
  125 | // B. Seed a reservation via API, then approve it in the UI (admin)
  126 | // ---------------------------------------------------------------------------
  127 | 
  128 | test.describe('Fullstack: reservations approval', () => {
  129 |   test('admin approves a seeded reservation and sees state change', async ({ page }) => {
  130 |     // Use admin because it has full scope visibility (manager-scoped reads
  131 |     // require extra setup we don't want to rely on mid-test).
  132 |     const adminCtx = await pwRequest.newContext();
  133 |     const adminLogin = await apiLogin(adminCtx, 'admin', 'admin123!');
```