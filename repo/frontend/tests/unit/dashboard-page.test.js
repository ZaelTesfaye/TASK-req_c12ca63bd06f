/**
 * Unit test for /dashboard +page.svelte.
 *
 * Dashboard fans out to several list endpoints depending on user roles.
 * We mock the auth store to report an admin user (so all role branches
 * fire) and verify the page issues the expected GET calls and renders
 * the stat tiles afterward.
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
let DashboardPage;

beforeEach(async () => {
  vi.resetModules();
  getMock = vi.fn().mockImplementation(async (url) => {
    if (url.startsWith('/events')) return { data: { data: [], pagination: { total: 7 } }, error: null };
    if (url.startsWith('/approvals')) return { data: { data: [], pagination: { total: 2 } }, error: null };
    if (url.startsWith('/reservations')) return { data: { data: [], pagination: { total: 4 } }, error: null };
    if (url.startsWith('/inventory/anomalies')) return { data: { data: [{ item_id: 'a' }] }, error: null };
    return { data: { data: [] }, error: null };
  });

  vi.doMock('$lib/api/client.js', () => ({ get: getMock, post: vi.fn() }));
  vi.doMock('$lib/stores/auth.js', () => ({
    authStore: {
      get: () => ({ user: { id: 'u1', username: 'admin', roles: ['admin'], permissions: [] } }),
      hasPermission: () => true,
    },
  }));

  const rtl = await import('@testing-library/svelte');
  render = rtl.render;

  DashboardPage = (await import('../../src/routes/dashboard/+page.svelte')).default;
});

afterEach(() => { vi.restoreAllMocks(); });

describe('/dashboard +page.svelte', () => {
  it('renders the welcome heading with the current user', async () => {
    const { findByText } = render(DashboardPage);
    expect(await findByText(/Welcome, admin/)).toBeTruthy();
  });

  it('issues GET calls to each role-gated endpoint for an admin', async () => {
    render(DashboardPage);
    // Allow the load effect to run
    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();

    const urls = getMock.mock.calls.map((c) => c[0]);
    expect(urls.some((u) => u.startsWith('/events'))).toBe(true);
    expect(urls.some((u) => u.startsWith('/approvals/pending'))).toBe(true);
    expect(urls.some((u) => u.startsWith('/reservations'))).toBe(true);
    expect(urls.some((u) => u.startsWith('/inventory/anomalies'))).toBe(true);
  });

  it('renders the event count tile after data loads', async () => {
    const { findByText } = render(DashboardPage);
    expect(await findByText('7')).toBeTruthy();
  });
});
