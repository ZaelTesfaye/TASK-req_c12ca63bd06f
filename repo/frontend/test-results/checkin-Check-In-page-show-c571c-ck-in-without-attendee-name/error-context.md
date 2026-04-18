# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: checkin.test.js >> Check-In page >> shows error when trying to check in without attendee name
- Location: tests/e2e/checkin.test.js:210:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://frontend:5173/check-in
Call log:
  - navigating to "http://frontend:5173/check-in", waiting until "load"

```

# Test source

```ts
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
  131 |     await expect(page.locator('h1')).toContainText('Event Check-In', { timeout: 10000 });
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
> 214 |     await page.goto('/check-in');
      |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://frontend:5173/check-in
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