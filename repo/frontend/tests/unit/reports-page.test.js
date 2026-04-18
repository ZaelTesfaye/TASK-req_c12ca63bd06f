/**
 * Unit test for the /reports +page.svelte.
 *
 * Covers mount + initial gap-check fetch. Interactive export-button
 * assertions live in the E2E suite — running them here through
 * @testing-library/svelte triggers a reactivity loop in Svelte 5's
 * $effect that hangs the worker pool.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

let render, cleanup;
let getMock, downloadReportMock;
let ReportsPage;

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  if (cleanup) cleanup();

  const stableResponse = { data: { data: [] }, error: null };
  getMock = vi.fn().mockResolvedValue(stableResponse);
  downloadReportMock = vi.fn().mockResolvedValue(null);

  vi.doMock('$lib/api/client.js', () => ({ get: getMock, post: vi.fn() }));
  vi.doMock('$lib/api/reports.js', () => ({ downloadReport: downloadReportMock }));
  vi.doMock('$lib/stores/auth.js', () => ({
    authStore: {
      get: () => ({ permissions: ['inventory:export', 'reports:export'] }),
      hasPermission: (p) => ['inventory:export', 'reports:export'].includes(p),
    },
  }));

  const rtl = await import('@testing-library/svelte');
  render = rtl.render;
  cleanup = rtl.cleanup;

  ReportsPage = (await import('../../src/routes/reports/+page.svelte')).default;
});

afterEach(() => {
  if (cleanup) cleanup();
  vi.restoreAllMocks();
});

describe('/reports +page.svelte', () => {
  it('renders the Reports heading', () => {
    const { getByText } = render(ReportsPage);
    expect(getByText('Reports')).toBeTruthy();
  });

  it('renders the three export cards for a caller with both permissions', () => {
    const { getByText } = render(ReportsPage);
    expect(getByText('Inventory Report')).toBeTruthy();
    expect(getByText('Events Report')).toBeTruthy();
    expect(getByText('Approvals Report')).toBeTruthy();
  });

  it('issues GET /inventory/gaps on mount to check for unresolved gaps', async () => {
    render(ReportsPage);
    await new Promise((r) => setTimeout(r, 50));
    expect(getMock).toHaveBeenCalled();
    const first = getMock.mock.calls[0][0];
    expect(first.startsWith('/inventory/gaps?')).toBe(true);
  });
});
