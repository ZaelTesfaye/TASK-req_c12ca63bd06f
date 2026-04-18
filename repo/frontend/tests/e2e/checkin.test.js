/**
 * E2E tests for the Check-In page.
 *
 * Uses Playwright with API route interception so no real backend is needed.
 * The check-in page uses a tablet-optimized dark-theme layout.
 */
import { test, expect } from '@playwright/test';
import { wrapData, wrapPage, primeSessionAuth } from './_fixtures.js';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
const mockServiceEvents = [
  {
    id: 'evt-1',
    title: 'Annual Gala',
    event_date: '2025-07-15',
    headcount: 200,
    state: 'in_service'
  },
  {
    id: 'evt-2',
    title: 'Team Lunch',
    event_date: '2025-07-16',
    headcount: 30,
    state: 'approved'
  }
];

const mockEventDetail = {
  id: 'evt-1',
  title: 'Annual Gala',
  event_date: '2025-07-15',
  headcount: 200,
  state: 'in_service',
  service_windows: [
    {
      label: 'Dinner',
      start_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      end_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    }
  ]
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function setupAuth(page) {
  await primeSessionAuth(page, {
    user: { id: 'u1', username: 'service-staff', name: 'service-staff', roles: ['service_staff'] },
    permissions: ['entitlement:redeem', 'event:read'],
    roles: ['service_staff'],
  });
}

async function setupCheckInRoutes(page, { occupancy = 50, overCap = false } = {}) {
  // Events list for the selector (both in_service and approved)
  await page.route('**/api/events?state=in_service**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(wrapPage(mockServiceEvents.filter((e) => e.state === 'in_service'))),
    });
  });

  await page.route('**/api/events?state=approved**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(wrapPage(mockServiceEvents.filter((e) => e.state === 'approved'))),
    });
  });

  // Event detail — wrapped to match GET /events/:id contract.
  await page.route('**/api/events/evt-1', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(wrapData(mockEventDetail)),
    });
  });

  // Check-in data
  const currentOccupancy = overCap ? 200 : occupancy;
  await page.route('**/api/events/evt-1/check-in', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(wrapData({
          checkIns: Array.from({ length: currentOccupancy }, (_, i) => ({
            attendee_label: `Attendee ${i + 1}`,
            checked_in_at: new Date().toISOString(),
          })),
          occupancy: currentOccupancy,
        })),
      });
    } else {
      // POST — the service returns { data: { checkIn, warning, warningMessage, occupancy } }
      const body = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(wrapData({
          checkIn: {
            id: 'ci-new',
            attendee_label: body.attendee_label,
            checked_in_at: new Date().toISOString(),
          },
          warning: overCap,
          warningMessage: overCap ? 'Over capacity' : undefined,
          occupancy: currentOccupancy + 1,
        })),
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Check-In page', () => {
  test('renders in tablet layout with dark theme', async ({ page }) => {
    await setupAuth(page);
    await setupCheckInRoutes(page);

    await page.goto('/check-in');

    // Page heading
    await expect(page.locator('h1')).toContainText('Event Check-In', { timeout: 10000 });

    // Dark background
    const bgClass = await page.locator('.min-h-screen').getAttribute('class');
    expect(bgClass).toContain('bg-gray-900');
  });

  test('event selection dropdown works', async ({ page }) => {
    await setupAuth(page);
    await setupCheckInRoutes(page);

    await page.goto('/check-in');

    // Select dropdown should be visible
    const select = page.locator('select');
    await expect(select).toBeVisible({ timeout: 10000 });

    // Should list available events
    await expect(page.locator('option:has-text("Annual Gala")')).toBeVisible();

    // Select the event
    await select.selectOption('evt-1');

    // After selection, the check-in interface should appear
    await expect(page.locator('text=Annual Gala').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=CHECK IN')).toBeVisible();
  });

  test('check-in button works', async ({ page }) => {
    await setupAuth(page);
    await setupCheckInRoutes(page);

    await page.goto('/check-in');

    // Select event
    await page.locator('select').selectOption('evt-1');
    await expect(page.locator('text=CHECK IN')).toBeVisible({ timeout: 10000 });

    // Enter attendee name
    await page.fill('input[placeholder="Attendee name or ID"]', 'John Doe');

    // Click check-in
    await page.click('text=CHECK IN');

    // Should show success message
    await expect(page.locator('text=John Doe checked in!')).toBeVisible({ timeout: 5000 });
  });

  test('occupancy counter is displayed after event selection', async ({ page }) => {
    await setupAuth(page);
    await setupCheckInRoutes(page, { occupancy: 75 });

    await page.goto('/check-in');

    await page.locator('select').selectOption('evt-1');

    // Occupancy counter should show (occupancy / headcount)
    await expect(page.locator('text=/\\d+ \\/ \\d+/')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Checked In')).toBeVisible();
  });

  test('over-capacity warning appears when at capacity', async ({ page }) => {
    await setupAuth(page);
    await setupCheckInRoutes(page, { overCap: true });

    await page.goto('/check-in');

    await page.locator('select').selectOption('evt-1');

    // Over-capacity warning should be visible
    await expect(page.locator('text=At or Over Capacity')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Additional check-ins require a reason')).toBeVisible();

    // Over-cap reason input should appear
    await expect(
      page.locator('input[placeholder="Reason for over-capacity check-in"]')
    ).toBeVisible();
  });

  test('shows error when trying to check in without attendee name', async ({ page }) => {
    await setupAuth(page);
    await setupCheckInRoutes(page);

    await page.goto('/check-in');

    await page.locator('select').selectOption('evt-1');
    await expect(page.locator('text=CHECK IN')).toBeVisible({ timeout: 10000 });

    // The CHECK IN button should be disabled when input is empty
    const checkInBtn = page.locator('button:has-text("CHECK IN")');
    await expect(checkInBtn).toBeDisabled();
  });
});
