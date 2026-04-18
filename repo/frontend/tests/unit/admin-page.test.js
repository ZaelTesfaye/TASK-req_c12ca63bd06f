/**
 * Unit test for /admin +page.svelte.
 * Mount + initial users tab loading.
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
let AdminPage;

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  if (cleanup) cleanup();

  getMock = vi.fn().mockResolvedValue({ data: { data: [] }, error: null });

  vi.doMock('$lib/api/client.js', () => ({
    get: getMock, post: vi.fn(), del: vi.fn(),
  }));
  vi.doMock('$lib/stores/auth.js', () => ({
    authStore: { get: () => ({}), hasPermission: () => true },
  }));

  const rtl = await import('@testing-library/svelte');
  render = rtl.render;
  cleanup = rtl.cleanup;

  AdminPage = (await import('../../src/routes/admin/+page.svelte')).default;
});

afterEach(() => {
  if (cleanup) cleanup();
  vi.restoreAllMocks();
});

describe('/admin +page.svelte', () => {
  it('loads the users tab on mount', async () => {
    render(AdminPage);
    await new Promise((r) => setTimeout(r, 50));
    expect(getMock).toHaveBeenCalled();
    const urls = getMock.mock.calls.map((c) => c[0]);
    expect(urls.some((u) => u.startsWith('/users'))).toBe(true);
  });
});
