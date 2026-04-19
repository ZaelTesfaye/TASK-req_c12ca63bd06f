/**
 * E2E tests for the login page — pure client-side validation and render.
 */
import { test, expect } from '@playwright/test';

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
