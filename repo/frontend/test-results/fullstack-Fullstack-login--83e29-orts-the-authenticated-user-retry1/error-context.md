# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fullstack.spec.js >> Fullstack: login flow >> planner logs in via UI and backend reports the authenticated user
- Location: tests/e2e/fullstack.spec.js:201:3

# Error details

```
Error: page.goto: net::ERR_NAME_NOT_RESOLVED at http://frontend:5173/login
Call log:
  - navigating to "http://frontend:5173/login", waiting until "load"

```

# Test source

```ts
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
  134 |     const adminAuth = { Authorization: `Bearer ${adminLogin.accessToken}` };
  135 | 
  136 |     // 1. Create an event to hang the reservation off of.
  137 |     const eventTitle = uniqueTitle('FS Reservable');
  138 |     const createEvent = await adminCtx.post(`${BACKEND_URL}/events`, {
  139 |       headers: adminAuth,
  140 |       data: {
  141 |         title: eventTitle,
  142 |         event_date: futureDate(14),
  143 |         headcount: 20,
  144 |         budget_amount: 500,
  145 |       },
  146 |     });
  147 |     expect(createEvent.ok(), 'event create').toBeTruthy();
  148 |     const evt = (await createEvent.json()).data;
  149 | 
  150 |     // 2. Discover a bookable resource from the catalog tree.
  151 |     const treeRes = await adminCtx.get(`${BACKEND_URL}/catalog/tree`, { headers: adminAuth });
  152 |     expect(treeRes.ok()).toBeTruthy();
  153 |     const tree = (await treeRes.json()).data;
  154 |     const resourceId = findLeafResourceId(tree);
  155 |     expect(resourceId, 'at least one leaf resource in catalog').toBeTruthy();
  156 | 
  157 |     // 3. Create the reservation itself (status=requested) via the API.
  158 |     const rsvRes = await adminCtx.post(`${BACKEND_URL}/reservations`, {
  159 |       headers: adminAuth,
  160 |       data: {
  161 |         event_id: evt.id,
  162 |         resource_id: resourceId,
  163 |         scheduled_start_at: futureIso(14, 10),
  164 |         scheduled_end_at: futureIso(14, 12),
  165 |       },
  166 |     });
  167 |     expect(rsvRes.ok(), 'reservation create').toBeTruthy();
  168 |     const reservation = (await rsvRes.json()).data;
  169 | 
  170 |     // 4. Now drive the UI as admin — approve the reservation.
  171 |     await primeBrowserAuth(page, adminLogin);
  172 |     await page.goto('/reservations');
  173 |     await expect(page.locator('h1')).toContainText('Reservations', { timeout: 15000 });
  174 | 
  175 |     // Filter to 'Requested' to narrow to our row.
  176 |     await page.locator('select').first().selectOption('requested');
  177 |     await expect(page.locator(`text=${eventTitle}`).first()).toBeVisible({ timeout: 15000 });
  178 | 
  179 |     // Click Approve on the row with our event title.
  180 |     const row = page.locator('tr', { hasText: eventTitle });
  181 |     await row.locator('button', { hasText: 'Approve' }).click();
  182 | 
  183 |     // The modal opens; click Confirm.
  184 |     await page.locator('button', { hasText: 'Confirm' }).click();
  185 | 
  186 |     // Reload & filter to approved — the reservation should now be in 'approved'.
  187 |     await page.locator('select').first().selectOption('approved');
  188 |     const approvedRow = page.locator('tr', { hasText: eventTitle });
  189 |     await expect(approvedRow).toContainText('approved', { timeout: 15000, ignoreCase: true });
  190 | 
  191 |     await adminCtx.dispose();
  192 |   });
  193 | });
  194 | 
  195 | // ---------------------------------------------------------------------------
  196 | // D. Real login flow: UI submits credentials, backend issues token, /auth/me
  197 | //    returns the authenticated user.
  198 | // ---------------------------------------------------------------------------
  199 | 
  200 | test.describe('Fullstack: login flow', () => {
  201 |   test('planner logs in via UI and backend reports the authenticated user', async ({ page }) => {
> 202 |     await page.goto('/login');
      |                ^ Error: page.goto: net::ERR_NAME_NOT_RESOLVED at http://frontend:5173/login
  203 |     await page.fill('#username', 'planner');
  204 |     await page.fill('#password', 'planner123!');
  205 |     await page.click('button[type="submit"]');
  206 | 
  207 |     // Redirect to an authenticated page (dashboard is the default landing).
  208 |     await page.waitForURL(/\/(dashboard|events).*$/, { timeout: 15000 });
  209 |     expect(page.url()).not.toMatch(/\/login/);
  210 | 
  211 |     // Pull the token the UI stored and verify /auth/me against the real backend.
  212 |     const token = await page.evaluate(() => {
  213 |       const raw = sessionStorage.getItem('hops_auth');
  214 |       return raw ? JSON.parse(raw).token : null;
  215 |     });
  216 |     expect(token, 'UI should have stored an access token after login').toBeTruthy();
  217 | 
  218 |     const api = await pwRequest.newContext();
  219 |     const meRes = await api.get(`${BACKEND_URL}/auth/me`, {
  220 |       headers: { Authorization: `Bearer ${token}` },
  221 |     });
  222 |     expect(meRes.ok(), '/auth/me should succeed with stored token').toBeTruthy();
  223 |     const me = await meRes.json();
  224 |     const user = me.data || me;
  225 |     expect(user.username).toBe('planner');
  226 |     await api.dispose();
  227 |   });
  228 | });
  229 | 
  230 | // ---------------------------------------------------------------------------
  231 | // E. Events list flow: GET /events returns real rows that render in the UI.
  232 | // ---------------------------------------------------------------------------
  233 | 
  234 | test.describe('Fullstack: events list flow', () => {
  235 |   test('real event created via API renders in the UI events list', async ({ page }) => {
  236 |     const adminCtx = await pwRequest.newContext();
  237 |     const adminLogin = await apiLogin(adminCtx, 'admin', 'admin123!');
  238 |     const adminAuth = { Authorization: `Bearer ${adminLogin.accessToken}` };
  239 | 
  240 |     const title = uniqueTitle('FS Listed Event');
  241 |     const evt = await adminCtx.post(`${BACKEND_URL}/events`, {
  242 |       headers: adminAuth,
  243 |       data: {
  244 |         title,
  245 |         event_date: futureDate(20),
  246 |         headcount: 12,
  247 |         budget_amount: 800,
  248 |       },
  249 |     });
  250 |     expect(evt.ok(), 'event create').toBeTruthy();
  251 | 
  252 |     await primeBrowserAuth(page, adminLogin);
  253 | 
  254 |     // Capture the real GET /events call as the events page loads.
  255 |     const eventsListResponsePromise = page.waitForResponse(
  256 |       (resp) => /\/events(\?|$)/.test(resp.url()) && resp.request().method() === 'GET',
  257 |       { timeout: 15000 },
  258 |     );
  259 | 
  260 |     await page.goto('/events');
  261 |     const eventsListResp = await eventsListResponsePromise;
  262 |     expect(eventsListResp.status(), 'GET /events should succeed').toBe(200);
  263 | 
  264 |     await expect(page.locator('h1')).toContainText('Events', { timeout: 15000 });
  265 |     await expect(page.locator(`text=${title}`).first()).toBeVisible({ timeout: 15000 });
  266 | 
  267 |     await adminCtx.dispose();
  268 |   });
  269 | });
  270 | 
  271 | // ---------------------------------------------------------------------------
  272 | // F. Check-in flow: seed an in_service event, perform check-in through the UI.
  273 | // ---------------------------------------------------------------------------
  274 | 
  275 | test.describe('Fullstack: check-in flow', () => {
  276 |   test('admin checks in an attendee at a seeded in_service event via the UI', async ({ page }) => {
  277 |     const adminCtx = await pwRequest.newContext();
  278 |     const adminLogin = await apiLogin(adminCtx, 'admin', 'admin123!');
  279 |     const adminAuth = { Authorization: `Bearer ${adminLogin.accessToken}` };
  280 | 
  281 |     // 1. Create the event.
  282 |     const title = uniqueTitle('FS Checkin Evt');
  283 |     const createRes = await adminCtx.post(`${BACKEND_URL}/events`, {
  284 |       headers: adminAuth,
  285 |       data: {
  286 |         title,
  287 |         event_date: futureDate(1),
  288 |         headcount: 30,
  289 |         budget_amount: 300,
  290 |       },
  291 |     });
  292 |     expect(createRes.ok(), 'event create').toBeTruthy();
  293 |     const evt = (await createRes.json()).data;
  294 | 
  295 |     // 2. Add a service window covering now so check-in is permitted.
  296 |     const swRes = await adminCtx.post(`${BACKEND_URL}/events/${evt.id}/service-windows`, {
  297 |       headers: adminAuth,
  298 |       data: {
  299 |         label: 'Service',
  300 |         start_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  301 |         end_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  302 |       },
```