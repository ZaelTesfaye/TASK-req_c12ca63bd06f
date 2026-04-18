/**
 * E2E tests for the login page.
 *
 * Uses Playwright with API route interception so no real backend is needed.
 */
import { test, expect } from '@playwright/test';
import { loginResponse, wrapPage } from './_fixtures.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Intercept API calls and provide mock auth responses. */
async function setupLoginMocks(page, { success = true } = {}) {
  await page.route('**/api/auth/login', async (route) => {
    const body = route.request().postDataJSON();

    if (success && body.username === 'admin' && body.password === 'password123') {
      // Match the actual backend shape: { accessToken, refreshToken, expiresIn, user }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(loginResponse()),
      });
    } else {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'UNAUTHORIZED', message: 'Invalid credentials' }),
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Login page', () => {
  test('renders with login form', async ({ page }) => {
    await page.goto('/login');

    // Page heading
    await expect(page.locator('h1')).toContainText('Hospitality Ops');
    await expect(page.locator('text=Sign in to your account')).toBeVisible();

    // Form fields
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();

    // Submit button
    await expect(page.locator('button[type="submit"]')).toContainText('Sign In');
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    await setupLoginMocks(page, { success: true });

    // Dashboard fan-out: every API returns an empty paginated envelope.
    const emptyPage = JSON.stringify(wrapPage([], { total: 0, totalPages: 0 }));
    await page.route('**/api/events**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: emptyPage });
    });
    await page.route('**/api/approvals/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: emptyPage });
    });
    await page.route('**/api/reservations**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: emptyPage });
    });
    await page.route('**/api/inventory/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: emptyPage });
    });

    await page.goto('/login');

    await page.fill('#username', 'admin');
    await page.fill('#password', 'password123');
    await page.click('button[type="submit"]');

    // Should navigate away from /login
    await page.waitForURL('**/dashboard**', { timeout: 10000 });
    expect(page.url()).toContain('/dashboard');
  });

  test('invalid credentials show error message', async ({ page }) => {
    await setupLoginMocks(page, { success: false });

    await page.goto('/login');

    await page.fill('#username', 'wronguser');
    await page.fill('#password', 'wrongpass123');
    await page.click('button[type="submit"]');

    // Error message should appear
    await expect(page.locator('text=Invalid username or password')).toBeVisible({ timeout: 5000 });
  });

  test('empty form shows validation errors', async ({ page }) => {
    await page.goto('/login');

    // Click submit with empty fields
    await page.click('button[type="submit"]');

    // Validation errors should appear
    await expect(page.locator('text=Username is required')).toBeVisible();
    await expect(page.locator('text=Password is required')).toBeVisible();
  });

  test('short username shows validation error', async ({ page }) => {
    await page.goto('/login');

    await page.fill('#username', 'ab');
    await page.fill('#password', 'password123');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=Username must be at least 3 characters')).toBeVisible();
  });

  test('short password shows validation error', async ({ page }) => {
    await page.goto('/login');

    await page.fill('#username', 'admin');
    await page.fill('#password', 'short');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=Password must be at least 8 characters')).toBeVisible();
  });
});
