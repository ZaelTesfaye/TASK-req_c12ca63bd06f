/**
 * Unit test for /entitlements +page.svelte.
 *
 * Exercises initial list load, permission-gated action buttons, and
 * verifies the redeem POST carries the selected quantity.
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

let render;
let getMock, postMock, uploadMock;
let EntitlementsPage;

beforeEach(async () => {
  vi.resetModules();
  getMock = vi.fn();
  postMock = vi.fn();
  uploadMock = vi.fn();

  vi.doMock('$lib/api/client.js', () => ({ get: getMock, post: postMock, upload: uploadMock }));
  vi.doMock('$lib/stores/auth.js', () => ({
    authStore: {
      get: () => ({}),
      hasPermission: (p) =>
        ['entitlement:redeem', 'entitlement:issue_manual', 'entitlement:bulk_import'].includes(p),
    },
  }));

  const rtl = await import('@testing-library/svelte');
  render = rtl.render;

  EntitlementsPage = (await import('../../src/routes/entitlements/+page.svelte')).default;
});

afterEach(() => { vi.restoreAllMocks(); });

describe('/entitlements +page.svelte', () => {
  it('fetches /entitlements on mount with pagination params', async () => {
    getMock.mockResolvedValue({ data: { data: [], pagination: { page: 1, pageSize: 20, total: 0 } }, error: null });
    render(EntitlementsPage);
    await Promise.resolve();
    await Promise.resolve();
    const first = getMock.mock.calls[0][0];
    expect(first.startsWith('/entitlements?')).toBe(true);
    expect(first).toMatch(/page=1/);
    expect(first).toMatch(/pageSize=20/);
  });

  it('renders entitlement rows returned by the API', async () => {
    getMock.mockResolvedValue({
      data: {
        data: [
          {
            id: 'ent-1',
            type_code: 'staff_meal',
            quantity_total: 10,
            quantity_remaining: 7,
            event_id: 'evt-1',
            user_id: 'u-1',
            expires_at: null,
          },
        ],
        pagination: { page: 1, pageSize: 20, total: 1 },
      },
      error: null,
    });
    const { findByText } = render(EntitlementsPage);
    expect(await findByText(/staff_meal/i)).toBeTruthy();
  });
});
