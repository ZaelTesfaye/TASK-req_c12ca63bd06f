/**
 * Unit test for /dashboard +page.svelte.
 * Mount + role-gated data fetches.
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
let DashboardPage;

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  if (cleanup) cleanup();

  getMock = vi.fn().mockResolvedValue({ data: { data: [], pagination: { total: 0 } }, error: null });

  vi.doMock('$lib/api/client.js', () => ({ get: getMock, post: vi.fn() }));
  vi.doMock('$lib/stores/auth.js', () => ({
    // dashboard/+page.svelte reads authStore.get() and then uses
    // user?.username / user?.roles at the top level (not nested under
    // `.user`). Match that shape so the template resolves the username
    // and the role-gated fetches fire.
    authStore: {
      get: () => ({
        username: 'admin',
        roles: ['admin'],
        permissions: [],
      }),
      hasPermission: () => true,
    },
  }));

  const rtl = await import('@testing-library/svelte');
  render = rtl.render;
  cleanup = rtl.cleanup;

  DashboardPage = (await import('../../src/routes/dashboard/+page.svelte')).default;
});

afterEach(() => {
  if (cleanup) cleanup();
  vi.restoreAllMocks();
});

describe('/dashboard +page.svelte', () => {
  it('renders the welcome heading', () => {
    const { getByText } = render(DashboardPage);
    expect(getByText(/Welcome, admin/)).toBeTruthy();
  });

  it('issues role-gated GET calls for an admin on mount', async () => {
    render(DashboardPage);
    await new Promise((r) => setTimeout(r, 50));
    expect(getMock).toHaveBeenCalled();
    const urls = getMock.mock.calls.map((c) => c[0]);
    expect(urls.some((u) => u.startsWith('/events'))).toBe(true);
  });
});
