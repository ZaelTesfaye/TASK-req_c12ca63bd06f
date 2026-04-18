# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: events.test.js >> Events list page >> create event button is visible for users with event:create permission
- Location: tests/e2e/events.test.js:159:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=+ Create Event')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('text=+ Create Event')

```

# Page snapshot

```yaml
- generic [ref=e2]: "Blocked request. This host (\"frontend\") is not allowed. To allow this host, add \"frontend\" to `server.allowedHosts` in vite.config.js."
```

# Test source

```ts
  65  | 
  66  |   await primeSessionAuth(page, {
  67  |     user: { id: 'u1', username: 'test-user', name: 'test-user', roles: [role] },
  68  |     permissions,
  69  |     roles: [role],
  70  |   });
  71  | }
  72  | 
  73  | async function setupEventRoutes(page) {
  74  |   await page.route('**/api/events?**', async (route) => {
  75  |     await route.fulfill({
  76  |       status: 200,
  77  |       contentType: 'application/json',
  78  |       body: JSON.stringify(wrapPage(mockEvents, { total: 2, totalPages: 1 })),
  79  |     });
  80  |   });
  81  | 
  82  |   await page.route('**/api/events/evt-1', async (route) => {
  83  |     if (route.request().method() === 'GET') {
  84  |       await route.fulfill({
  85  |         status: 200,
  86  |         contentType: 'application/json',
  87  |         body: JSON.stringify(wrapData(mockEventDetail)),
  88  |       });
  89  |     } else {
  90  |       await route.fulfill({
  91  |         status: 200,
  92  |         contentType: 'application/json',
  93  |         body: JSON.stringify(wrapData({ ...mockEventDetail, state: 'submitted' })),
  94  |       });
  95  |     }
  96  |   });
  97  | 
  98  |   await page.route('**/api/events/evt-1/state', async (route) => {
  99  |     await route.fulfill({
  100 |       status: 200,
  101 |       contentType: 'application/json',
  102 |       body: JSON.stringify(wrapData({ ...mockEventDetail, state: 'submitted' })),
  103 |     });
  104 |   });
  105 | 
  106 |   await page.route('**/api/events/evt-1/audit-trail**', async (route) => {
  107 |     await route.fulfill({
  108 |       status: 200,
  109 |       contentType: 'application/json',
  110 |       body: JSON.stringify(wrapPage([], { total: 0, totalPages: 1 })),
  111 |     });
  112 |   });
  113 | 
  114 |   await page.route('**/api/attachments**', async (route) => {
  115 |     await route.fulfill({
  116 |       status: 200,
  117 |       contentType: 'application/json',
  118 |       body: JSON.stringify(wrapData([])),
  119 |     });
  120 |   });
  121 | 
  122 |   await page.route('**/api/events', async (route) => {
  123 |     if (route.request().method() === 'POST') {
  124 |       const body = route.request().postDataJSON();
  125 |       await route.fulfill({
  126 |         status: 201,
  127 |         contentType: 'application/json',
  128 |         body: JSON.stringify(wrapData({ id: 'evt-new', ...body, state: 'draft' })),
  129 |       });
  130 |     } else {
  131 |       await route.fulfill({
  132 |         status: 200,
  133 |         contentType: 'application/json',
  134 |         body: JSON.stringify(wrapPage(mockEvents, { total: 2, totalPages: 1 })),
  135 |       });
  136 |     }
  137 |   });
  138 | }
  139 | 
  140 | // ---------------------------------------------------------------------------
  141 | // Tests
  142 | // ---------------------------------------------------------------------------
  143 | 
  144 | test.describe('Events list page', () => {
  145 |   test('events list loads and shows events', async ({ page }) => {
  146 |     await setupAuthenticatedSession(page);
  147 |     await setupEventRoutes(page);
  148 | 
  149 |     await page.goto('/events');
  150 | 
  151 |     // Wait for events to load
  152 |     await expect(page.locator('text=Annual Gala')).toBeVisible({ timeout: 10000 });
  153 |     await expect(page.locator('text=Team Building')).toBeVisible();
  154 | 
  155 |     // Page heading
  156 |     await expect(page.locator('h1')).toContainText('Events');
  157 |   });
  158 | 
  159 |   test('create event button is visible for users with event:create permission', async ({ page }) => {
  160 |     await setupAuthenticatedSession(page);
  161 |     await setupEventRoutes(page);
  162 | 
  163 |     await page.goto('/events');
  164 | 
> 165 |     await expect(page.locator('text=+ Create Event')).toBeVisible({ timeout: 10000 });
      |                                                       ^ Error: expect(locator).toBeVisible() failed
  166 |   });
  167 | 
  168 |   test('filter controls are present', async ({ page }) => {
  169 |     await setupAuthenticatedSession(page);
  170 |     await setupEventRoutes(page);
  171 | 
  172 |     await page.goto('/events');
  173 | 
  174 |     // Status filter select
  175 |     await expect(page.locator('select')).toBeVisible({ timeout: 10000 });
  176 |     // Search input
  177 |     await expect(page.locator('input[placeholder="Search events..."]')).toBeVisible();
  178 |     // Apply button
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
```