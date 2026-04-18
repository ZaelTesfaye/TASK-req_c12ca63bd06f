/**
 * Unit test for the /reports +page.svelte.
 *
 * Mounts the page with its API client and authStore dependencies mocked
 * so we can verify the page-level logic: gap detection blocks inventory
 * export, and the three export buttons invoke the download helper with
 * the correct paths.
 *
 * This covers the gap flagged in coverage: page-level logic had only E2E
 * coverage. This suite fails fast at the unit level on regressions.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// sessionStorage shim needed by the auth store module chain
const storage = {};
Object.defineProperty(globalThis, 'sessionStorage', {
  value: {
    getItem: vi.fn((k) => storage[k] ?? null),
    setItem: vi.fn((k, v) => { storage[k] = v; }),
    removeItem: vi.fn((k) => { delete storage[k]; }),
    clear: vi.fn(() => { for (const k of Object.keys(storage)) delete storage[k]; }),
  },
  writable: true,
  configurable: true,
});

let render, fireEvent;
let getMock, downloadReportMock;
let ReportsPage;

beforeEach(async () => {
  vi.resetModules();

  getMock = vi.fn();
  downloadReportMock = vi.fn().mockResolvedValue(null);

  vi.doMock('$lib/api/client.js', () => ({ get: getMock, post: vi.fn() }));
  vi.doMock('$lib/api/reports.js', () => ({ downloadReport: downloadReportMock }));
  vi.doMock('$lib/stores/auth.js', () => ({
    authStore: {
      get: () => ({ permissions: ['inventory:export', 'reports:export'] }),
      hasPermission: (p) =>
        ['inventory:export', 'reports:export'].includes(p),
    },
  }));

  const rtl = await import('@testing-library/svelte');
  render = rtl.render;
  fireEvent = rtl.fireEvent;

  ReportsPage = (await import('../../src/routes/reports/+page.svelte')).default;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('/reports +page.svelte', () => {
  it('renders all three export cards when the user has both permissions', async () => {
    getMock.mockResolvedValue({ data: { data: [] }, error: null });
    const { getByText, findByText } = render(ReportsPage);
    expect(getByText('Reports')).toBeTruthy();
    expect(await findByText('Inventory Report')).toBeTruthy();
    expect(getByText('Events Report')).toBeTruthy();
    expect(getByText('Approvals Report')).toBeTruthy();
  });

  it('invokes downloadReport with the inventory export path when gaps are absent', async () => {
    getMock.mockResolvedValue({ data: { data: [] }, error: null });
    const { findByText } = render(ReportsPage);
    const inventoryBtn = await findByText('Inventory Report');
    // Click the sibling Export CSV button on the Inventory card
    const card = inventoryBtn.closest('.bg-white');
    const button = card.querySelector('button');
    expect(button).toBeTruthy();
    await fireEvent.click(button);
    // allow the microtask queue to flush so the await on checkGaps resolves
    await Promise.resolve();
    await Promise.resolve();
    expect(downloadReportMock).toHaveBeenCalled();
    const [path, filename] = downloadReportMock.mock.calls[0];
    expect(path).toMatch(/^\/reports\/inventory\/export\?/);
    expect(path).toMatch(/from_date=/);
    expect(path).toMatch(/to_date=/);
    expect(filename).toMatch(/^inventory-/);
    expect(filename).toMatch(/\.csv$/);
  });

  it('blocks inventory export when unresolved gaps are returned by /inventory/gaps', async () => {
    getMock.mockResolvedValue({
      data: { data: [{ item_id: 'x', missing_date: '2026-01-01' }] },
      error: null,
    });

    const { findByText, container } = render(ReportsPage);
    // Wait for the gap warning banner to appear
    await findByText(/Unresolved inventory gaps detected/i);

    // Inventory export button must be disabled
    const inventoryHeading = container.querySelector('h3');
    expect(inventoryHeading).toBeTruthy();
    // Click the inventory card's button — the handler should early-return
    // and never call downloadReport.
    const inventoryCard = Array.from(container.querySelectorAll('h3'))
      .find((h) => h.textContent.includes('Inventory Report'))
      .closest('.bg-white');
    const inventoryButton = inventoryCard.querySelector('button');
    await fireEvent.click(inventoryButton);

    expect(downloadReportMock).not.toHaveBeenCalled();
  });

  it('uses the correct path when exporting the events report', async () => {
    getMock.mockResolvedValue({ data: { data: [] }, error: null });
    const { container, findByText } = render(ReportsPage);
    await findByText('Events Report');

    const eventsCard = Array.from(container.querySelectorAll('h3'))
      .find((h) => h.textContent.includes('Events Report'))
      .closest('.bg-white');
    await fireEvent.click(eventsCard.querySelector('button'));

    expect(downloadReportMock).toHaveBeenCalled();
    const [path, filename] = downloadReportMock.mock.calls[0];
    expect(path).toMatch(/^\/reports\/events\/export\?/);
    expect(filename).toMatch(/^events-/);
  });

  it('uses the correct path when exporting the approvals report', async () => {
    getMock.mockResolvedValue({ data: { data: [] }, error: null });
    const { container, findByText } = render(ReportsPage);
    await findByText('Approvals Report');

    const approvalsCard = Array.from(container.querySelectorAll('h3'))
      .find((h) => h.textContent.includes('Approvals Report'))
      .closest('.bg-white');
    await fireEvent.click(approvalsCard.querySelector('button'));

    expect(downloadReportMock).toHaveBeenCalled();
    const [path, filename] = downloadReportMock.mock.calls[0];
    expect(path).toMatch(/^\/reports\/approvals\/export\?/);
    expect(filename).toMatch(/^approvals-/);
  });
});
