/**
 * E2E tests for the overtime approval flow on /reservations.
 *
 * Regression guard for the frontend-backend contract: the backend route
 * POST /reservations/:id/approve-overtime requires { justification } in
 * the body (see backend/src/modules/reservations/routes.js), but the
 * modal previously omitted the field, causing every overtime approval to
 * 422 against a live server.
 *
 * This test intercepts the approve-overtime request, asserts the body
 * carries a non-empty justification string, and confirms the UI transitions
 * the reservation out of its pending-overtime state after a 200 response.
 */
import { test, expect } from '@playwright/test';
import { wrapPage, primeSessionAuth } from './_fixtures.js';

const RES_ID = 'res-overtime-1';

const mockPendingOvertime = {
  id: RES_ID,
  event_id: 'evt-1',
  event_title: 'Annual Gala',
  resource_id: 'resrc-1',
  resource_name: 'Ballroom A',
  resource_type: 'space',
  status: 'occupied',
  scheduled_start_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
  scheduled_end_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  overtime_minutes: 45,
  overtime_pending_approval: true,
  created_by: 'u1',
};

const mockResolvedOvertime = {
  ...mockPendingOvertime,
  overtime_pending_approval: false,
};

async function setupAuth(page) {
  await primeSessionAuth(page, {
    user: { id: 'u1', username: 'approver', name: 'approver', roles: ['approver'] },
    permissions: [
      'reservation:request',
      'reservation:approve',
      'reservation:operate',
      'reservation:overtime_approve',
    ],
    roles: ['approver'],
  });
}

async function setupReservationRoutes(page, { listState = 'pending' } = {}) {
  let currentList = listState;

  await page.route('**/api/reservations?**', async (route) => {
    const rows = currentList === 'pending' ? [mockPendingOvertime] : [mockResolvedOvertime];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(wrapPage(rows)),
    });
  });

  // Switch the list response after the approval succeeds so we can assert
  // the UI reflects the updated state on re-load.
  return {
    flipToResolved: () => {
      currentList = 'resolved';
    },
  };
}

test.describe('Reservations — overtime approval', () => {
  test('modal captures justification and includes it in the POST body', async ({ page }) => {
    await setupAuth(page);
    const ctrl = await setupReservationRoutes(page);

    // Intercept the approve-overtime POST and capture the request payload.
    let capturedBody = null;
    await page.route(`**/api/reservations/${RES_ID}/approve-overtime`, async (route, request) => {
      capturedBody = request.postDataJSON();
      ctrl.flipToResolved();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { ...mockResolvedOvertime } }),
      });
    });

    await page.goto('/reservations');

    // The overtime button should render for reservations with
    // overtime_pending_approval=true when the caller holds overtime_approve.
    const otBtn = page.getByRole('button', { name: /Approve OT/i });
    await expect(otBtn).toBeVisible({ timeout: 10000 });
    await otBtn.click();

    // Modal appears with a justification input labelled "Justification"
    const justification = page.locator('#overtime-justification');
    await expect(justification).toBeVisible();

    // Confirm is disabled while justification is empty
    const confirmBtn = page.getByRole('button', { name: 'Confirm' });
    await expect(confirmBtn).toBeDisabled();

    await justification.fill('Final cleanup ran long; approved by on-site manager.');
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    // Request must include the justification in the body
    await expect.poll(() => capturedBody, { timeout: 5000 }).not.toBeNull();
    expect(capturedBody.justification).toBe('Final cleanup ran long; approved by on-site manager.');

    // After the 200, the UI reloads the list and the "Pending" overtime
    // badge should no longer be visible for this reservation row.
    await expect(page.locator('text=Pending')).toHaveCount(0, { timeout: 5000 });
  });

  test('Confirm stays disabled until a non-blank justification is entered', async ({ page }) => {
    await setupAuth(page);
    await setupReservationRoutes(page);

    await page.goto('/reservations');
    await page.getByRole('button', { name: /Approve OT/i }).click();

    const confirmBtn = page.getByRole('button', { name: 'Confirm' });
    const justification = page.locator('#overtime-justification');

    await expect(confirmBtn).toBeDisabled();

    // Whitespace-only should not enable submission
    await justification.fill('   ');
    await expect(confirmBtn).toBeDisabled();

    await justification.fill('valid reason');
    await expect(confirmBtn).toBeEnabled();
  });
});
