/**
 * Unit test for /reservations +page.svelte.
 *
 * Covers mount + initial list-load. Interactive tests (modal submit,
 * $effect-triggering form edits) are covered in the E2E suite under
 * tests/e2e/reservations-overtime.test.js — running them here triggers
 * a Svelte 5 reactivity loop (see tests/unit/README for details) that
 * hangs the worker pool.
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
let ReservationsPage;

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  if (cleanup) cleanup();

  // A stable pagination reference avoids a Svelte 5 re-run loop when the
  // component reassigns pagination inside its $effect.
  const stableResponse = { data: { data: [] }, error: null };
  getMock = vi.fn().mockResolvedValue(stableResponse);

  vi.doMock('$lib/api/client.js', () => ({ get: getMock, post: vi.fn() }));
  vi.doMock('$lib/stores/auth.js', () => ({
    authStore: {
      get: () => ({}),
      hasPermission: () => false,
    },
  }));

  const rtl = await import('@testing-library/svelte');
  render = rtl.render;
  cleanup = rtl.cleanup;

  ReservationsPage = (await import('../../src/routes/reservations/+page.svelte')).default;
});

afterEach(() => {
  if (cleanup) cleanup();
  vi.restoreAllMocks();
});

describe('/reservations +page.svelte', () => {
  it('renders the page heading', () => {
    const { getByText } = render(ReservationsPage);
    expect(getByText('Reservations')).toBeTruthy();
  });

  it('fetches /reservations on mount with pagination params', async () => {
    render(ReservationsPage);
    // Let the onMount $effect run and the mock resolve.
    await new Promise((r) => setTimeout(r, 50));
    expect(getMock).toHaveBeenCalled();
    const first = getMock.mock.calls[0][0];
    expect(first.startsWith('/reservations?')).toBe(true);
    expect(first).toMatch(/page=1/);
  });
});
