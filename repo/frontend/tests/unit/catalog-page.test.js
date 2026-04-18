/**
 * Unit test for /catalog +page.svelte.
 * Mount + initial /catalog/tree fetch.
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
let CatalogPage;

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  if (cleanup) cleanup();

  getMock = vi.fn().mockResolvedValue({ data: [], error: null });

  vi.doMock('$lib/api/client.js', () => ({
    get: getMock, post: vi.fn(), patch: vi.fn(),
  }));
  vi.doMock('$lib/stores/auth.js', () => ({
    authStore: { get: () => ({}), hasPermission: (p) => p === 'resource:manage' },
  }));

  const rtl = await import('@testing-library/svelte');
  render = rtl.render;
  cleanup = rtl.cleanup;

  CatalogPage = (await import('../../src/routes/catalog/+page.svelte')).default;
});

afterEach(() => {
  if (cleanup) cleanup();
  vi.restoreAllMocks();
});

describe('/catalog +page.svelte', () => {
  it('fetches /catalog/tree on mount', async () => {
    render(CatalogPage);
    await new Promise((r) => setTimeout(r, 50));
    expect(getMock).toHaveBeenCalledWith('/catalog/tree');
  });

  it('mounts without throwing', () => {
    const { container } = render(CatalogPage);
    expect(container.childElementCount).toBeGreaterThan(0);
  });
});
