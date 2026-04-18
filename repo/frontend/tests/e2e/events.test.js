/**
 * E2E tests for the Events module.
 *
 * Uses Playwright with API route interception so no real backend is needed.
 */
import { test, expect } from '@playwright/test';
import { wrapData, wrapPage, primeSessionAuth } from './_fixtures.js';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
const mockEvents = [
  {
    id: 'evt-1',
    title: 'Annual Gala',
    event_date: '2025-07-15',
    headcount: 200,
    budget_amount: 15000,
    state: 'draft',
    created_at: '2025-06-01T10:00:00Z',
    created_by: 'u1'
  },
  {
    id: 'evt-2',
    title: 'Team Building',
    event_date: '2025-08-01',
    headcount: 50,
    budget_amount: 5000,
    state: 'approved',
    created_at: '2025-06-10T10:00:00Z',
    created_by: 'u2'
  }
];

const mockEventDetail = {
  id: 'evt-1',
  title: 'Annual Gala',
  description: 'A formal gala dinner for all staff.',
  event_date: '2025-07-15',
  headcount: 200,
  budget_amount: 15000,
  budget_cap: 25000,
  state: 'draft',
  created_at: '2025-06-01T10:00:00Z',
  created_by: 'u1',
  service_windows: [
    { label: 'Dinner', start_at: '2025-07-15T18:00:00Z', end_at: '2025-07-15T22:00:00Z' }
  ],
  materials: [],
  resource_requests: []
};

// ---------------------------------------------------------------------------
// Helper: setup auth via sessionStorage and mock API routes
// ---------------------------------------------------------------------------
async function setupAuthenticatedSession(page, { role = 'admin' } = {}) {
  const permissions =
    role === 'admin'
      ? [
          'event:read', 'event:create', 'event:update', 'event:submit',
          'event:approve', 'event:service', 'event:close',
          'admin:roles', 'audit:read', 'attachment:upload'
        ]
      : ['event:read', 'event:create', 'event:submit'];

  await primeSessionAuth(page, {
    user: { id: 'u1', username: 'test-user', name: 'test-user', roles: [role] },
    permissions,
    roles: [role],
  });
}

async function setupEventRoutes(page) {
  await page.route('**/api/events?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(wrapPage(mockEvents, { total: 2, totalPages: 1 })),
    });
  });

  await page.route('**/api/events/evt-1', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(wrapData(mockEventDetail)),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(wrapData({ ...mockEventDetail, state: 'submitted' })),
      });
    }
  });

  await page.route('**/api/events/evt-1/state', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(wrapData({ ...mockEventDetail, state: 'submitted' })),
    });
  });

  await page.route('**/api/events/evt-1/audit-trail**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(wrapPage([], { total: 0, totalPages: 1 })),
    });
  });

  await page.route('**/api/attachments**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(wrapData([])),
    });
  });

  await page.route('**/api/events', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(wrapData({ id: 'evt-new', ...body, state: 'draft' })),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(wrapPage(mockEvents, { total: 2, totalPages: 1 })),
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Events list page', () => {
  test('events list loads and shows events', async ({ page }) => {
    await setupAuthenticatedSession(page);
    await setupEventRoutes(page);

    await page.goto('/events');

    // Wait for events to load
    await expect(page.locator('text=Annual Gala')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Team Building')).toBeVisible();

    // Page heading
    await expect(page.locator('h1')).toContainText('Events');
  });

  test('create event button is visible for users with event:create permission', async ({ page }) => {
    await setupAuthenticatedSession(page);
    await setupEventRoutes(page);

    await page.goto('/events');

    await expect(page.locator('text=+ Create Event')).toBeVisible({ timeout: 10000 });
  });

  test('filter controls are present', async ({ page }) => {
    await setupAuthenticatedSession(page);
    await setupEventRoutes(page);

    await page.goto('/events');

    // Status filter select
    await expect(page.locator('select')).toBeVisible({ timeout: 10000 });
    // Search input
    await expect(page.locator('input[placeholder="Search events..."]')).toBeVisible();
    // Apply button
    await expect(page.locator('text=Apply')).toBeVisible();
  });
});

test.describe('Create event form', () => {
  test('create event form renders and accepts input', async ({ page }) => {
    await setupAuthenticatedSession(page);
    await setupEventRoutes(page);

    // Mock the new event detail page with the real { data: ... } envelope
    await page.route('**/api/events/evt-new', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(wrapData({
          id: 'evt-new',
          title: 'New Test Event',
          description: '',
          event_date: '2025-12-01',
          headcount: 100,
          budget_amount: 10000,
          budget_cap: 25000,
          state: 'draft',
          service_windows: [],
          materials: [],
          resource_requests: [],
        })),
      });
    });

    await page.route('**/api/events/evt-new/audit-trail**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(wrapPage([], { total: 0, totalPages: 1 })),
      });
    });

    await page.goto('/events/new');

    // Form heading
    await expect(page.locator('h1')).toContainText('Create New Event');

    // Fill in the form
    await page.fill('input[placeholder="Event title"]', 'New Test Event');
    await page.fill('textarea', 'A test event description');
    await page.fill('input[type="date"]', '2025-12-01');
    await page.fill('input[type="number"][min="1"]', '100');

    // Submit the form
    await page.click('button[type="submit"]');

    // Should redirect to the event detail page
    await page.waitForURL('**/events/evt-new**', { timeout: 10000 });
  });

  test('create event form shows validation errors for empty required fields', async ({ page }) => {
    await setupAuthenticatedSession(page);
    await setupEventRoutes(page);

    await page.goto('/events/new');

    // Clear the pre-filled headcount and set to 0
    await page.fill('input[type="number"][min="1"]', '0');

    // Submit with empty required fields
    await page.click('button[type="submit"]');

    await expect(page.locator('text=Title is required')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Event detail page', () => {
  test('event detail shows event data', async ({ page }) => {
    await setupAuthenticatedSession(page);
    await setupEventRoutes(page);

    await page.goto('/events/evt-1');

    await expect(page.locator('h1')).toContainText('Annual Gala', { timeout: 10000 });
    await expect(page.locator('text=200 guests')).toBeVisible();
    await expect(page.locator('text=2025-07-15')).toBeVisible();
  });

  test('state transition buttons appear based on role (admin)', async ({ page }) => {
    await setupAuthenticatedSession(page, { role: 'admin' });
    await setupEventRoutes(page);

    await page.goto('/events/evt-1');

    // Draft event with admin role should show "Submit for Approval" button
    await expect(page.locator('text=Submit for Approval')).toBeVisible({ timeout: 10000 });
  });

  test('event detail shows budget information', async ({ page }) => {
    await setupAuthenticatedSession(page);
    await setupEventRoutes(page);

    await page.goto('/events/evt-1');

    await expect(page.locator('text=Budget')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=15,000')).toBeVisible();
  });
});
