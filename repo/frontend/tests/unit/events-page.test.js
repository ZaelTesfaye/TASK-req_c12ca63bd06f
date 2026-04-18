/**
 * Unit test for /events +page.svelte.
 *
 * Mounts the page with SvelteKit and API mocks; verifies the component
 * renders and the list fetch fires on mount.
 *
 * Note: the events page reassigns `pagination` from the API response in
 * an $effect, which can feed a render loop if the mock returns a fresh
 * pagination object on every call. We omit `pagination` from the default
 * mock so the `|| pagination` fallback keeps the same reference.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readable } from 'svelte/store';

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
let EventsPage;

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  if (cleanup) cleanup();

  getMock = vi.fn().mockResolvedValue({
    data: { data: [] },
    error: null,
  });

  vi.doMock('$lib/api/client.js', () => ({ get: getMock, post: vi.fn() }));
  vi.doMock('$lib/stores/auth.js', () => ({
    authStore: {
      get: () => ({ permissions: ['event:read', 'event:create'] }),
      hasPermission: (p) => ['event:read', 'event:create'].includes(p),
    },
  }));
  vi.doMock('$app/navigation', () => ({ goto: vi.fn() }));
  vi.doMock('$app/stores', () => ({
    page: readable({ url: new URL('http://localhost/events') }),
  }));

  const rtl = await import('@testing-library/svelte');
  render = rtl.render;
  cleanup = rtl.cleanup;

  EventsPage = (await import('../../src/routes/events/+page.svelte')).default;
});

afterEach(() => {
  if (cleanup) cleanup();
  vi.restoreAllMocks();
});

describe('/events +page.svelte', () => {
  it('renders the page heading and the Events list shell', () => {
    const { getByText } = render(EventsPage);
    expect(getByText('Events')).toBeTruthy();
  });

  it('issues GET /events with pagination params on mount', async () => {
    render(EventsPage);
    await new Promise((r) => setTimeout(r, 50));
    expect(getMock).toHaveBeenCalled();
    const url = getMock.mock.calls[0][0];
    expect(url).toMatch(/^\/events\?/);
    expect(url).toMatch(/page=1/);
    expect(url).toMatch(/pageSize=20/);
  });

  it('renders the Create Event link when the caller has event:create', () => {
    const { getByText } = render(EventsPage);
    const link = getByText(/Create Event/i);
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/events/new');
  });
});
