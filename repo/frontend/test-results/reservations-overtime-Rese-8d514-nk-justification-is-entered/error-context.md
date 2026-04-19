# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: reservations-overtime.test.js >> Reservations — overtime approval >> Confirm stays disabled until a non-blank justification is entered
- Location: tests/e2e/reservations-overtime.test.js:119:3

# Error details

```
Error: page.goto: net::ERR_NAME_NOT_RESOLVED at http://frontend:5173/reservations
Call log:
  - navigating to "http://frontend:5173/reservations", waiting until "load"

```

# Test source

```ts
  23  |   resource_id: 'resrc-1',
  24  |   resource_name: 'Ballroom A',
  25  |   resource_type: 'space',
  26  |   status: 'occupied',
  27  |   scheduled_start_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
  28  |   scheduled_end_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  29  |   overtime_minutes: 45,
  30  |   overtime_pending_approval: true,
  31  |   created_by: 'u1',
  32  | };
  33  | 
  34  | const mockResolvedOvertime = {
  35  |   ...mockPendingOvertime,
  36  |   overtime_pending_approval: false,
  37  | };
  38  | 
  39  | async function setupAuth(page) {
  40  |   await primeSessionAuth(page, {
  41  |     user: { id: 'u1', username: 'approver', name: 'approver', roles: ['approver'] },
  42  |     permissions: [
  43  |       'reservation:request',
  44  |       'reservation:approve',
  45  |       'reservation:operate',
  46  |       'reservation:overtime_approve',
  47  |     ],
  48  |     roles: ['approver'],
  49  |   });
  50  | }
  51  | 
  52  | async function setupReservationRoutes(page, { listState = 'pending' } = {}) {
  53  |   let currentList = listState;
  54  | 
  55  |   await page.route('**/api/reservations?**', async (route) => {
  56  |     const rows = currentList === 'pending' ? [mockPendingOvertime] : [mockResolvedOvertime];
  57  |     await route.fulfill({
  58  |       status: 200,
  59  |       contentType: 'application/json',
  60  |       body: JSON.stringify(wrapPage(rows)),
  61  |     });
  62  |   });
  63  | 
  64  |   // Switch the list response after the approval succeeds so we can assert
  65  |   // the UI reflects the updated state on re-load.
  66  |   return {
  67  |     flipToResolved: () => {
  68  |       currentList = 'resolved';
  69  |     },
  70  |   };
  71  | }
  72  | 
  73  | test.describe('Reservations — overtime approval', () => {
  74  |   test('modal captures justification and includes it in the POST body', async ({ page }) => {
  75  |     await setupAuth(page);
  76  |     const ctrl = await setupReservationRoutes(page);
  77  | 
  78  |     // Intercept the approve-overtime POST and capture the request payload.
  79  |     let capturedBody = null;
  80  |     await page.route(`**/api/reservations/${RES_ID}/approve-overtime`, async (route, request) => {
  81  |       capturedBody = request.postDataJSON();
  82  |       ctrl.flipToResolved();
  83  |       await route.fulfill({
  84  |         status: 200,
  85  |         contentType: 'application/json',
  86  |         body: JSON.stringify({ data: { ...mockResolvedOvertime } }),
  87  |       });
  88  |     });
  89  | 
  90  |     await page.goto('/reservations');
  91  | 
  92  |     // The overtime button should render for reservations with
  93  |     // overtime_pending_approval=true when the caller holds overtime_approve.
  94  |     const otBtn = page.getByRole('button', { name: /Approve OT/i });
  95  |     await expect(otBtn).toBeVisible({ timeout: 10000 });
  96  |     await otBtn.click();
  97  | 
  98  |     // Modal appears with a justification input labelled "Justification"
  99  |     const justification = page.locator('#overtime-justification');
  100 |     await expect(justification).toBeVisible();
  101 | 
  102 |     // Confirm is disabled while justification is empty
  103 |     const confirmBtn = page.getByRole('button', { name: 'Confirm' });
  104 |     await expect(confirmBtn).toBeDisabled();
  105 | 
  106 |     await justification.fill('Final cleanup ran long; approved by on-site manager.');
  107 |     await expect(confirmBtn).toBeEnabled();
  108 |     await confirmBtn.click();
  109 | 
  110 |     // Request must include the justification in the body
  111 |     await expect.poll(() => capturedBody, { timeout: 5000 }).not.toBeNull();
  112 |     expect(capturedBody.justification).toBe('Final cleanup ran long; approved by on-site manager.');
  113 | 
  114 |     // After the 200, the UI reloads the list and the "Pending" overtime
  115 |     // badge should no longer be visible for this reservation row.
  116 |     await expect(page.locator('text=Pending')).toHaveCount(0, { timeout: 5000 });
  117 |   });
  118 | 
  119 |   test('Confirm stays disabled until a non-blank justification is entered', async ({ page }) => {
  120 |     await setupAuth(page);
  121 |     await setupReservationRoutes(page);
  122 | 
> 123 |     await page.goto('/reservations');
      |                ^ Error: page.goto: net::ERR_NAME_NOT_RESOLVED at http://frontend:5173/reservations
  124 |     await page.getByRole('button', { name: /Approve OT/i }).click();
  125 | 
  126 |     const confirmBtn = page.getByRole('button', { name: 'Confirm' });
  127 |     const justification = page.locator('#overtime-justification');
  128 | 
  129 |     await expect(confirmBtn).toBeDisabled();
  130 | 
  131 |     // Whitespace-only should not enable submission
  132 |     await justification.fill('   ');
  133 |     await expect(confirmBtn).toBeDisabled();
  134 | 
  135 |     await justification.fill('valid reason');
  136 |     await expect(confirmBtn).toBeEnabled();
  137 |   });
  138 | });
  139 | 
```