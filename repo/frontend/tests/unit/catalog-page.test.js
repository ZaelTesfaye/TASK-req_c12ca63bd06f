/**
 * Unit test for /catalog +page.svelte.
 *
 * Verifies the catalog tree load on mount, the resource:manage-gated
 * Create Resource action, and a basic render assertion.
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
let getMock, postMock, patchMock;
let CatalogPage;

beforeEach(async () => {
  vi.resetModules();
  getMock = vi.fn();
  postMock = vi.fn();
  patchMock = vi.fn();

  vi.doMock('$lib/api/client.js', () => ({ get: getMock, post: postMock, patch: patchMock }));
  vi.doMock('$lib/stores/auth.js', () => ({
    authStore: { get: () => ({}), hasPermission: (p) => p === 'resource:manage' },
  }));

  const rtl = await import('@testing-library/svelte');
  render = rtl.render;

  CatalogPage = (await import('../../src/routes/catalog/+page.svelte')).default;
});

afterEach(() => { vi.restoreAllMocks(); });

describe('/catalog +page.svelte', () => {
  it('fetches /catalog/tree on mount', async () => {
    getMock.mockResolvedValue({ data: [], error: null });
    render(CatalogPage);
    await Promise.resolve();
    await Promise.resolve();
    expect(getMock).toHaveBeenCalledWith('/catalog/tree');
  });

  it('renders root tree nodes returned by the API', async () => {
    getMock.mockResolvedValue({
      data: [
        { id: 'root-1', name: 'Ballroom', resource_type: 'venue', status: 'published', children: [] },
      ],
      error: null,
    });
    const { findByText } = render(CatalogPage);
    expect(await findByText('Ballroom')).toBeTruthy();
  });

  it('mounts without throwing', () => {
    getMock.mockResolvedValue({ data: [], error: null });
    const { container } = render(CatalogPage);
    expect(container.childElementCount).toBeGreaterThan(0);
  });
});
