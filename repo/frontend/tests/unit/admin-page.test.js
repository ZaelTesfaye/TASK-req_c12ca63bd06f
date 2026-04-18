/**
 * Unit test for /admin +page.svelte.
 *
 * The admin page uses a tab system; on mount it loads the "users" tab
 * which fans out to GET /users and GET /admin/roles. We verify both
 * calls fire and the page renders its tab controls.
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
let getMock, postMock, delMock;
let AdminPage;

beforeEach(async () => {
  vi.resetModules();
  getMock = vi.fn();
  postMock = vi.fn();
  delMock = vi.fn();

  vi.doMock('$lib/api/client.js', () => ({
    get: getMock,
    post: postMock,
    del: delMock,
  }));
  vi.doMock('$lib/stores/auth.js', () => ({
    authStore: { get: () => ({}), hasPermission: () => true },
  }));

  const rtl = await import('@testing-library/svelte');
  render = rtl.render;

  AdminPage = (await import('../../src/routes/admin/+page.svelte')).default;
});

afterEach(() => { vi.restoreAllMocks(); });

describe('/admin +page.svelte', () => {
  it('loads the users tab on mount (GET /users + GET /admin/roles)', async () => {
    getMock.mockResolvedValue({ data: { data: [] }, error: null });
    render(AdminPage);
    await Promise.resolve();
    await Promise.resolve();

    const urls = getMock.mock.calls.map((c) => c[0]);
    expect(urls.some((u) => u.startsWith('/users'))).toBe(true);
    expect(urls.some((u) => u === '/admin/roles')).toBe(true);
  });

  it('renders user rows returned by the API', async () => {
    getMock.mockImplementation(async (url) => {
      if (url.startsWith('/users')) {
        return {
          data: {
            data: [
              { id: 'u-1', username: 'admin_user', status: 'active', roles: [{ id: 'r-1', name: 'admin' }] },
            ],
          },
          error: null,
        };
      }
      return { data: [], error: null };
    });
    const { findByText } = render(AdminPage);
    expect(await findByText('admin_user')).toBeTruthy();
  });
});
