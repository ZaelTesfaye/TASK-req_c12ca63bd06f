# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: login.test.js >> Login page >> empty form shows validation errors
- Location: tests/e2e/login.test.js:97:3

# Error details

```
Error: page.goto: net::ERR_NAME_NOT_RESOLVED at http://frontend:5173/login
Call log:
  - navigating to "http://frontend:5173/login", waiting until "load"

```

# Test source

```ts
  1   | /**
  2   |  * E2E tests for the login page.
  3   |  *
  4   |  * Uses Playwright with API route interception so no real backend is needed.
  5   |  */
  6   | import { test, expect } from '@playwright/test';
  7   | import { loginResponse, wrapPage } from './_fixtures.js';
  8   | 
  9   | // ---------------------------------------------------------------------------
  10  | // Helpers
  11  | // ---------------------------------------------------------------------------
  12  | 
  13  | /** Intercept API calls and provide mock auth responses. */
  14  | async function setupLoginMocks(page, { success = true } = {}) {
  15  |   await page.route('**/api/auth/login', async (route) => {
  16  |     const body = route.request().postDataJSON();
  17  | 
  18  |     if (success && body.username === 'admin' && body.password === 'password123') {
  19  |       // Match the actual backend shape: { accessToken, refreshToken, expiresIn, user }
  20  |       await route.fulfill({
  21  |         status: 200,
  22  |         contentType: 'application/json',
  23  |         body: JSON.stringify(loginResponse()),
  24  |       });
  25  |     } else {
  26  |       await route.fulfill({
  27  |         status: 401,
  28  |         contentType: 'application/json',
  29  |         body: JSON.stringify({ code: 'UNAUTHORIZED', message: 'Invalid credentials' }),
  30  |       });
  31  |     }
  32  |   });
  33  | }
  34  | 
  35  | // ---------------------------------------------------------------------------
  36  | // Tests
  37  | // ---------------------------------------------------------------------------
  38  | 
  39  | test.describe('Login page', () => {
  40  |   test('renders with login form', async ({ page }) => {
  41  |     await page.goto('/login');
  42  | 
  43  |     // Page heading
  44  |     await expect(page.locator('h1')).toContainText('Hospitality Ops');
  45  |     await expect(page.locator('text=Sign in to your account')).toBeVisible();
  46  | 
  47  |     // Form fields
  48  |     await expect(page.locator('#username')).toBeVisible();
  49  |     await expect(page.locator('#password')).toBeVisible();
  50  | 
  51  |     // Submit button
  52  |     await expect(page.locator('button[type="submit"]')).toContainText('Sign In');
  53  |   });
  54  | 
  55  |   test('successful login redirects to dashboard', async ({ page }) => {
  56  |     await setupLoginMocks(page, { success: true });
  57  | 
  58  |     // Dashboard fan-out: every API returns an empty paginated envelope.
  59  |     const emptyPage = JSON.stringify(wrapPage([], { total: 0, totalPages: 0 }));
  60  |     await page.route('**/api/events**', async (route) => {
  61  |       await route.fulfill({ status: 200, contentType: 'application/json', body: emptyPage });
  62  |     });
  63  |     await page.route('**/api/approvals/**', async (route) => {
  64  |       await route.fulfill({ status: 200, contentType: 'application/json', body: emptyPage });
  65  |     });
  66  |     await page.route('**/api/reservations**', async (route) => {
  67  |       await route.fulfill({ status: 200, contentType: 'application/json', body: emptyPage });
  68  |     });
  69  |     await page.route('**/api/inventory/**', async (route) => {
  70  |       await route.fulfill({ status: 200, contentType: 'application/json', body: emptyPage });
  71  |     });
  72  | 
  73  |     await page.goto('/login');
  74  | 
  75  |     await page.fill('#username', 'admin');
  76  |     await page.fill('#password', 'password123');
  77  |     await page.click('button[type="submit"]');
  78  | 
  79  |     // Should navigate away from /login
  80  |     await page.waitForURL('**/dashboard**', { timeout: 10000 });
  81  |     expect(page.url()).toContain('/dashboard');
  82  |   });
  83  | 
  84  |   test('invalid credentials show error message', async ({ page }) => {
  85  |     await setupLoginMocks(page, { success: false });
  86  | 
  87  |     await page.goto('/login');
  88  | 
  89  |     await page.fill('#username', 'wronguser');
  90  |     await page.fill('#password', 'wrongpass123');
  91  |     await page.click('button[type="submit"]');
  92  | 
  93  |     // Error message should appear
  94  |     await expect(page.locator('text=Invalid username or password')).toBeVisible({ timeout: 5000 });
  95  |   });
  96  | 
  97  |   test('empty form shows validation errors', async ({ page }) => {
> 98  |     await page.goto('/login');
      |                ^ Error: page.goto: net::ERR_NAME_NOT_RESOLVED at http://frontend:5173/login
  99  | 
  100 |     // Click submit with empty fields
  101 |     await page.click('button[type="submit"]');
  102 | 
  103 |     // Validation errors should appear
  104 |     await expect(page.locator('text=Username is required')).toBeVisible();
  105 |     await expect(page.locator('text=Password is required')).toBeVisible();
  106 |   });
  107 | 
  108 |   test('short username shows validation error', async ({ page }) => {
  109 |     await page.goto('/login');
  110 | 
  111 |     await page.fill('#username', 'ab');
  112 |     await page.fill('#password', 'password123');
  113 |     await page.click('button[type="submit"]');
  114 | 
  115 |     await expect(page.locator('text=Username must be at least 3 characters')).toBeVisible();
  116 |   });
  117 | 
  118 |   test('short password shows validation error', async ({ page }) => {
  119 |     await page.goto('/login');
  120 | 
  121 |     await page.fill('#username', 'admin');
  122 |     await page.fill('#password', 'short');
  123 |     await page.click('button[type="submit"]');
  124 | 
  125 |     await expect(page.locator('text=Password must be at least 8 characters')).toBeVisible();
  126 |   });
  127 | });
  128 | 
```