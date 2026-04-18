/**
 * Unit test for /recipes +page.svelte.
 *
 * Mounts the page, verifies the recipe list fetch, and confirms the
 * "Create Recipe" link is gated on the recipe:create permission.
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
let getMock;
let RecipesPage;

beforeEach(async () => {
  vi.resetModules();
  getMock = vi.fn();

  vi.doMock('$lib/api/client.js', () => ({ get: getMock, post: vi.fn() }));
  vi.doMock('$lib/stores/auth.js', () => ({
    authStore: { get: () => ({}), hasPermission: (p) => p === 'recipe:create' },
  }));
  vi.doMock('$app/navigation', () => ({ goto: vi.fn() }));

  const rtl = await import('@testing-library/svelte');
  render = rtl.render;

  RecipesPage = (await import('../../src/routes/recipes/+page.svelte')).default;
});

afterEach(() => { vi.restoreAllMocks(); });

describe('/recipes +page.svelte', () => {
  it('fetches /recipes on mount', async () => {
    getMock.mockResolvedValue({ data: { data: [], pagination: { page: 1, pageSize: 20, total: 0 } }, error: null });
    render(RecipesPage);
    await Promise.resolve();
    await Promise.resolve();
    expect(getMock).toHaveBeenCalled();
    expect(getMock.mock.calls[0][0].startsWith('/recipes?')).toBe(true);
  });

  it('renders recipe rows returned by the API', async () => {
    getMock.mockResolvedValue({
      data: {
        data: [
          {
            id: 'rec-1',
            slug: 'pasta-primavera',
            current_version_title: 'Pasta Primavera',
            current_version_no: 2,
            current_version_status: 'approved',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-02T00:00:00Z',
          },
        ],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
      error: null,
    });
    const { findByText } = render(RecipesPage);
    expect(await findByText(/Pasta Primavera/)).toBeTruthy();
  });

  it('renders the Create Recipe link when the user has recipe:create', async () => {
    getMock.mockResolvedValue({ data: { data: [], pagination: {} }, error: null });
    const { getByText } = render(RecipesPage);
    expect(getByText(/Create Recipe/i)).toBeTruthy();
  });
});
