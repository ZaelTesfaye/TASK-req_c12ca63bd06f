/**
 * Unit test for /recipes +page.svelte.
 * Mount + initial /recipes fetch.
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
let RecipesPage;

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  if (cleanup) cleanup();

  getMock = vi.fn().mockResolvedValue({ data: { data: [] }, error: null });

  vi.doMock('$lib/api/client.js', () => ({ get: getMock, post: vi.fn() }));
  vi.doMock('$lib/stores/auth.js', () => ({
    authStore: { get: () => ({}), hasPermission: (p) => p === 'recipe:create' },
  }));
  vi.doMock('$app/navigation', () => ({ goto: vi.fn() }));

  const rtl = await import('@testing-library/svelte');
  render = rtl.render;
  cleanup = rtl.cleanup;

  RecipesPage = (await import('../../src/routes/recipes/+page.svelte')).default;
});

afterEach(() => {
  if (cleanup) cleanup();
  vi.restoreAllMocks();
});

describe('/recipes +page.svelte', () => {
  it('renders the Recipes heading', () => {
    const { getByText } = render(RecipesPage);
    expect(getByText('Recipes')).toBeTruthy();
  });

  it('fetches /recipes on mount', async () => {
    render(RecipesPage);
    await new Promise((r) => setTimeout(r, 50));
    expect(getMock).toHaveBeenCalled();
    expect(getMock.mock.calls[0][0].startsWith('/recipes?')).toBe(true);
  });

  it('shows the Create Recipe link for users with recipe:create', () => {
    const { getByText } = render(RecipesPage);
    expect(getByText(/Create Recipe/i)).toBeTruthy();
  });
});
