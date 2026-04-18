# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: events.test.js >> Event detail page >> event detail shows budget information
- Location: tests/e2e/events.test.js:273:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=Budget')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('text=Budget')

```

# Page snapshot

```yaml
- generic [ref=e2]: "Blocked request. This host (\"frontend\") is not allowed. To allow this host, add \"frontend\" to `server.allowedHosts` in vite.config.js."
```

# Test source

```ts
  179 |     await expect(page.locator('text=Apply')).toBeVisible();
  180 |   });
  181 | });
  182 | 
  183 | test.describe('Create event form', () => {
  184 |   test('create event form renders and accepts input', async ({ page }) => {
  185 |     await setupAuthenticatedSession(page);
  186 |     await setupEventRoutes(page);
  187 | 
  188 |     // Mock the new event detail page with the real { data: ... } envelope
  189 |     await page.route('**/api/events/evt-new', async (route) => {
  190 |       await route.fulfill({
  191 |         status: 200,
  192 |         contentType: 'application/json',
  193 |         body: JSON.stringify(wrapData({
  194 |           id: 'evt-new',
  195 |           title: 'New Test Event',
  196 |           description: '',
  197 |           event_date: '2025-12-01',
  198 |           headcount: 100,
  199 |           budget_amount: 10000,
  200 |           budget_cap: 25000,
  201 |           state: 'draft',
  202 |           service_windows: [],
  203 |           materials: [],
  204 |           resource_requests: [],
  205 |         })),
  206 |       });
  207 |     });
  208 | 
  209 |     await page.route('**/api/events/evt-new/audit-trail**', async (route) => {
  210 |       await route.fulfill({
  211 |         status: 200,
  212 |         contentType: 'application/json',
  213 |         body: JSON.stringify(wrapPage([], { total: 0, totalPages: 1 })),
  214 |       });
  215 |     });
  216 | 
  217 |     await page.goto('/events/new');
  218 | 
  219 |     // Form heading
  220 |     await expect(page.locator('h1')).toContainText('Create New Event');
  221 | 
  222 |     // Fill in the form
  223 |     await page.fill('input[placeholder="Event title"]', 'New Test Event');
  224 |     await page.fill('textarea', 'A test event description');
  225 |     await page.fill('input[type="date"]', '2025-12-01');
  226 |     await page.fill('input[type="number"][min="1"]', '100');
  227 | 
  228 |     // Submit the form
  229 |     await page.click('button[type="submit"]');
  230 | 
  231 |     // Should redirect to the event detail page
  232 |     await page.waitForURL('**/events/evt-new**', { timeout: 10000 });
  233 |   });
  234 | 
  235 |   test('create event form shows validation errors for empty required fields', async ({ page }) => {
  236 |     await setupAuthenticatedSession(page);
  237 |     await setupEventRoutes(page);
  238 | 
  239 |     await page.goto('/events/new');
  240 | 
  241 |     // Clear the pre-filled headcount and set to 0
  242 |     await page.fill('input[type="number"][min="1"]', '0');
  243 | 
  244 |     // Submit with empty required fields
  245 |     await page.click('button[type="submit"]');
  246 | 
  247 |     await expect(page.locator('text=Title is required')).toBeVisible({ timeout: 5000 });
  248 |   });
  249 | });
  250 | 
  251 | test.describe('Event detail page', () => {
  252 |   test('event detail shows event data', async ({ page }) => {
  253 |     await setupAuthenticatedSession(page);
  254 |     await setupEventRoutes(page);
  255 | 
  256 |     await page.goto('/events/evt-1');
  257 | 
  258 |     await expect(page.locator('h1')).toContainText('Annual Gala', { timeout: 10000 });
  259 |     await expect(page.locator('text=200 guests')).toBeVisible();
  260 |     await expect(page.locator('text=2025-07-15')).toBeVisible();
  261 |   });
  262 | 
  263 |   test('state transition buttons appear based on role (admin)', async ({ page }) => {
  264 |     await setupAuthenticatedSession(page, { role: 'admin' });
  265 |     await setupEventRoutes(page);
  266 | 
  267 |     await page.goto('/events/evt-1');
  268 | 
  269 |     // Draft event with admin role should show "Submit for Approval" button
  270 |     await expect(page.locator('text=Submit for Approval')).toBeVisible({ timeout: 10000 });
  271 |   });
  272 | 
  273 |   test('event detail shows budget information', async ({ page }) => {
  274 |     await setupAuthenticatedSession(page);
  275 |     await setupEventRoutes(page);
  276 | 
  277 |     await page.goto('/events/evt-1');
  278 | 
> 279 |     await expect(page.locator('text=Budget')).toBeVisible({ timeout: 10000 });
      |                                               ^ Error: expect(locator).toBeVisible() failed
  280 |     await expect(page.locator('text=15,000')).toBeVisible();
  281 |   });
  282 | });
  283 | 
```