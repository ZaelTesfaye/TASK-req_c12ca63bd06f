/**
 * Unit test for /entitlements +page.svelte.
 * Mount + initial /entitlements fetch.
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
let getMock;
let EntitlementsPage;

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  if (cleanup) cleanup();

  getMock = vi.fn().mockResolvedValue({ data: { data: [] }, error: null });

  vi.doMock('$lib/api/client.js', () => ({
    get: getMock, post: vi.fn(), upload: vi.fn(),
  }));
  vi.doMock('$lib/stores/auth.js', () => ({
    authStore: {
      get: () => ({}),
      hasPermission: (p) =>
        ['entitlement:redeem', 'entitlement:issue_manual', 'entitlement:bulk_import'].includes(p),
    },
  }));

  const rtl = await import('@testing-library/svelte');
  render = rtl.render;
  cleanup = rtl.cleanup;

  EntitlementsPage = (await import('../../src/routes/entitlements/+page.svelte')).default;
});

afterEach(() => {
  if (cleanup) cleanup();
  vi.restoreAllMocks();
});

describe('/entitlements +page.svelte', () => {
  it('fetches /entitlements on mount', async () => {
    render(EntitlementsPage);
    await new Promise((r) => setTimeout(r, 50));
    expect(getMock).toHaveBeenCalled();
    expect(getMock.mock.calls[0][0].startsWith('/entitlements?')).toBe(true);
  });
});
