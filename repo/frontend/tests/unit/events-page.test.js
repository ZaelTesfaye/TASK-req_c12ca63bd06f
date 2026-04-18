/**
 * Unit test for /events +page.svelte.
 *
 * Covers mount + initial list fetch. Interactive search/filter tests are
 * covered in the E2E suite — they trigger the page's $effect which
 * reassigns `pagination`, which in turn can re-run the effect in a loop
 * under vitest + Svelte 5 if the mock response varies across calls.
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

  // Omit `pagination` from the response so the page's
  // `pagination = data?.pagination || pagination` falls through to the
  // existing reference (no re-trigger).
  const stableResponse = { data: { data: [] }, error: null };
  getMock = vi.fn().mockResolvedValue(stableResponse);

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
  it('renders the Events heading', () => {
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

  it('shows the Create Event link when the caller holds event:create', () => {
    const { getByText } = render(EventsPage);
    const link = getByText(/Create Event/i);
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/events/new');
  });
});
