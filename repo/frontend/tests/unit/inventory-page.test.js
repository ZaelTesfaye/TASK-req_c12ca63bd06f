/**
 * Unit test for /inventory +page.svelte.
 * Mount + initial /inventory/items fetch.
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
let getMock, postMock, downloadReportMock;
let InventoryPage;

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  if (cleanup) cleanup();

  getMock = vi.fn().mockResolvedValue({ data: { data: [] }, error: null });
  postMock = vi.fn();
  downloadReportMock = vi.fn().mockResolvedValue(null);

  vi.doMock('$lib/api/client.js', () => ({ get: getMock, post: postMock }));
  vi.doMock('$lib/api/reports.js', () => ({ downloadReport: downloadReportMock }));
  vi.doMock('$lib/stores/auth.js', () => ({
    authStore: {
      get: () => ({}),
      hasPermission: (p) =>
        ['inventory:read', 'inventory:resolve_gap', 'inventory:export'].includes(p),
    },
  }));

  const rtl = await import('@testing-library/svelte');
  render = rtl.render;
  cleanup = rtl.cleanup;

  InventoryPage = (await import('../../src/routes/inventory/+page.svelte')).default;
});

afterEach(() => {
  if (cleanup) cleanup();
  vi.restoreAllMocks();
});

describe('/inventory +page.svelte', () => {
  it('renders the Inventory heading', () => {
    const { getByText } = render(InventoryPage);
    expect(getByText('Inventory')).toBeTruthy();
  });

  it('fetches the items list on mount', async () => {
    render(InventoryPage);
    await new Promise((r) => setTimeout(r, 50));
    expect(getMock).toHaveBeenCalled();
    const first = getMock.mock.calls[0][0];
    expect(first.startsWith('/inventory/items')).toBe(true);
  });

  it('renders the Export CSV button when inventory:export is granted', () => {
    const { getByText } = render(InventoryPage);
    expect(getByText('Export CSV')).toBeTruthy();
  });
});
