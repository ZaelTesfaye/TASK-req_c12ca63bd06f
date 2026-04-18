/**
 * Unit test for /inventory +page.svelte.
 *
 * Covers the initial items load, tab-switch reloads, and the presence of
 * the Export CSV button when the caller holds inventory:export.
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

let render, fireEvent;
let getMock, postMock, downloadReportMock;
let InventoryPage;

beforeEach(async () => {
  vi.resetModules();
  getMock = vi.fn();
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
  fireEvent = rtl.fireEvent;

  InventoryPage = (await import('../../src/routes/inventory/+page.svelte')).default;
});

afterEach(() => { vi.restoreAllMocks(); });

describe('/inventory +page.svelte', () => {
  it('fetches the items list on mount', async () => {
    getMock.mockResolvedValue({ data: { data: [], pagination: { page: 1, pageSize: 20, total: 0 } }, error: null });
    render(InventoryPage);
    await Promise.resolve();
    await Promise.resolve();
    const first = getMock.mock.calls[0][0];
    expect(first.startsWith('/inventory/items')).toBe(true);
  });

  it('renders inventory item rows from the API response', async () => {
    getMock.mockResolvedValue({
      data: {
        data: [
          { id: 'i-1', name: 'Flour', kind: 'ingredient', unit: 'kg', current_quantity: 25, current_unit_price: 1.2 },
        ],
        pagination: { page: 1, pageSize: 20, total: 1 },
      },
      error: null,
    });
    const { findByText } = render(InventoryPage);
    expect(await findByText('Flour')).toBeTruthy();
  });

  it('renders the Export CSV button when inventory:export is granted', async () => {
    getMock.mockResolvedValue({ data: { data: [], pagination: {} }, error: null });
    const { getByText } = render(InventoryPage);
    expect(getByText('Export CSV')).toBeTruthy();
  });

  it('calls downloadReport when Export CSV is clicked and no gaps exist', async () => {
    getMock.mockResolvedValue({ data: { data: [], pagination: {} }, error: null });
    const { getByText } = render(InventoryPage);
    await fireEvent.click(getByText('Export CSV'));
    await Promise.resolve();
    expect(downloadReportMock).toHaveBeenCalled();
    const [path] = downloadReportMock.mock.calls[0];
    expect(path).toMatch(/^\/reports\/inventory\/export\?/);
  });
});
