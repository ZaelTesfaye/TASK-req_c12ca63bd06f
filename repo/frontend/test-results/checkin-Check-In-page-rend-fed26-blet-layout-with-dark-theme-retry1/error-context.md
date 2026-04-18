# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: checkin.test.js >> Check-In page >> renders in tablet layout with dark theme
- Location: tests/e2e/checkin.test.js:124:3

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('h1')
Expected substring: "Event Check-In"
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toContainText" with timeout 10000ms
  - waiting for locator('h1')

```

# Page snapshot

```yaml
- generic [ref=e2]: "Blocked request. This host (\"frontend\") is not allowed. To allow this host, add \"frontend\" to `server.allowedHosts` in vite.config.js."
```

# Test source

```ts
  31  |   id: 'evt-1',
  32  |   title: 'Annual Gala',
  33  |   event_date: '2025-07-15',
  34  |   headcount: 200,
  35  |   state: 'in_service',
  36  |   service_windows: [
  37  |     {
  38  |       label: 'Dinner',
  39  |       start_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  40  |       end_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  41  |     }
  42  |   ]
  43  | };
  44  | 
  45  | // ---------------------------------------------------------------------------
  46  | // Helpers
  47  | // ---------------------------------------------------------------------------
  48  | async function setupAuth(page) {
  49  |   await primeSessionAuth(page, {
  50  |     user: { id: 'u1', username: 'service-staff', name: 'service-staff', roles: ['service_staff'] },
  51  |     permissions: ['entitlement:redeem', 'event:read'],
  52  |     roles: ['service_staff'],
  53  |   });
  54  | }
  55  | 
  56  | async function setupCheckInRoutes(page, { occupancy = 50, overCap = false } = {}) {
  57  |   // Events list for the selector (both in_service and approved)
  58  |   await page.route('**/api/events?state=in_service**', async (route) => {
  59  |     await route.fulfill({
  60  |       status: 200,
  61  |       contentType: 'application/json',
  62  |       body: JSON.stringify(wrapPage(mockServiceEvents.filter((e) => e.state === 'in_service'))),
  63  |     });
  64  |   });
  65  | 
  66  |   await page.route('**/api/events?state=approved**', async (route) => {
  67  |     await route.fulfill({
  68  |       status: 200,
  69  |       contentType: 'application/json',
  70  |       body: JSON.stringify(wrapPage(mockServiceEvents.filter((e) => e.state === 'approved'))),
  71  |     });
  72  |   });
  73  | 
  74  |   // Event detail — wrapped to match GET /events/:id contract.
  75  |   await page.route('**/api/events/evt-1', async (route) => {
  76  |     await route.fulfill({
  77  |       status: 200,
  78  |       contentType: 'application/json',
  79  |       body: JSON.stringify(wrapData(mockEventDetail)),
  80  |     });
  81  |   });
  82  | 
  83  |   // Check-in data
  84  |   const currentOccupancy = overCap ? 200 : occupancy;
  85  |   await page.route('**/api/events/evt-1/check-in', async (route) => {
  86  |     if (route.request().method() === 'GET') {
  87  |       await route.fulfill({
  88  |         status: 200,
  89  |         contentType: 'application/json',
  90  |         body: JSON.stringify(wrapData({
  91  |           checkIns: Array.from({ length: currentOccupancy }, (_, i) => ({
  92  |             attendee_label: `Attendee ${i + 1}`,
  93  |             checked_in_at: new Date().toISOString(),
  94  |           })),
  95  |           occupancy: currentOccupancy,
  96  |         })),
  97  |       });
  98  |     } else {
  99  |       // POST — the service returns { data: { checkIn, warning, warningMessage, occupancy } }
  100 |       const body = route.request().postDataJSON();
  101 |       await route.fulfill({
  102 |         status: 201,
  103 |         contentType: 'application/json',
  104 |         body: JSON.stringify(wrapData({
  105 |           checkIn: {
  106 |             id: 'ci-new',
  107 |             attendee_label: body.attendee_label,
  108 |             checked_in_at: new Date().toISOString(),
  109 |           },
  110 |           warning: overCap,
  111 |           warningMessage: overCap ? 'Over capacity' : undefined,
  112 |           occupancy: currentOccupancy + 1,
  113 |         })),
  114 |       });
  115 |     }
  116 |   });
  117 | }
  118 | 
  119 | // ---------------------------------------------------------------------------
  120 | // Tests
  121 | // ---------------------------------------------------------------------------
  122 | 
  123 | test.describe('Check-In page', () => {
  124 |   test('renders in tablet layout with dark theme', async ({ page }) => {
  125 |     await setupAuth(page);
  126 |     await setupCheckInRoutes(page);
  127 | 
  128 |     await page.goto('/check-in');
  129 | 
  130 |     // Page heading
> 131 |     await expect(page.locator('h1')).toContainText('Event Check-In', { timeout: 10000 });
      |                                      ^ Error: expect(locator).toContainText(expected) failed
  132 | 
  133 |     // Dark background
  134 |     const bgClass = await page.locator('.min-h-screen').getAttribute('class');
  135 |     expect(bgClass).toContain('bg-gray-900');
  136 |   });
  137 | 
  138 |   test('event selection dropdown works', async ({ page }) => {
  139 |     await setupAuth(page);
  140 |     await setupCheckInRoutes(page);
  141 | 
  142 |     await page.goto('/check-in');
  143 | 
  144 |     // Select dropdown should be visible
  145 |     const select = page.locator('select');
  146 |     await expect(select).toBeVisible({ timeout: 10000 });
  147 | 
  148 |     // Should list available events
  149 |     await expect(page.locator('option:has-text("Annual Gala")')).toBeVisible();
  150 | 
  151 |     // Select the event
  152 |     await select.selectOption('evt-1');
  153 | 
  154 |     // After selection, the check-in interface should appear
  155 |     await expect(page.locator('text=Annual Gala').first()).toBeVisible({ timeout: 10000 });
  156 |     await expect(page.locator('text=CHECK IN')).toBeVisible();
  157 |   });
  158 | 
  159 |   test('check-in button works', async ({ page }) => {
  160 |     await setupAuth(page);
  161 |     await setupCheckInRoutes(page);
  162 | 
  163 |     await page.goto('/check-in');
  164 | 
  165 |     // Select event
  166 |     await page.locator('select').selectOption('evt-1');
  167 |     await expect(page.locator('text=CHECK IN')).toBeVisible({ timeout: 10000 });
  168 | 
  169 |     // Enter attendee name
  170 |     await page.fill('input[placeholder="Attendee name or ID"]', 'John Doe');
  171 | 
  172 |     // Click check-in
  173 |     await page.click('text=CHECK IN');
  174 | 
  175 |     // Should show success message
  176 |     await expect(page.locator('text=John Doe checked in!')).toBeVisible({ timeout: 5000 });
  177 |   });
  178 | 
  179 |   test('occupancy counter is displayed after event selection', async ({ page }) => {
  180 |     await setupAuth(page);
  181 |     await setupCheckInRoutes(page, { occupancy: 75 });
  182 | 
  183 |     await page.goto('/check-in');
  184 | 
  185 |     await page.locator('select').selectOption('evt-1');
  186 | 
  187 |     // Occupancy counter should show (occupancy / headcount)
  188 |     await expect(page.locator('text=/\\d+ \\/ \\d+/')).toBeVisible({ timeout: 10000 });
  189 |     await expect(page.locator('text=Checked In')).toBeVisible();
  190 |   });
  191 | 
  192 |   test('over-capacity warning appears when at capacity', async ({ page }) => {
  193 |     await setupAuth(page);
  194 |     await setupCheckInRoutes(page, { overCap: true });
  195 | 
  196 |     await page.goto('/check-in');
  197 | 
  198 |     await page.locator('select').selectOption('evt-1');
  199 | 
  200 |     // Over-capacity warning should be visible
  201 |     await expect(page.locator('text=At or Over Capacity')).toBeVisible({ timeout: 10000 });
  202 |     await expect(page.locator('text=Additional check-ins require a reason')).toBeVisible();
  203 | 
  204 |     // Over-cap reason input should appear
  205 |     await expect(
  206 |       page.locator('input[placeholder="Reason for over-capacity check-in"]')
  207 |     ).toBeVisible();
  208 |   });
  209 | 
  210 |   test('shows error when trying to check in without attendee name', async ({ page }) => {
  211 |     await setupAuth(page);
  212 |     await setupCheckInRoutes(page);
  213 | 
  214 |     await page.goto('/check-in');
  215 | 
  216 |     await page.locator('select').selectOption('evt-1');
  217 |     await expect(page.locator('text=CHECK IN')).toBeVisible({ timeout: 10000 });
  218 | 
  219 |     // The CHECK IN button should be disabled when input is empty
  220 |     const checkInBtn = page.locator('button:has-text("CHECK IN")');
  221 |     await expect(checkInBtn).toBeDisabled();
  222 |   });
  223 | });
  224 | 
```