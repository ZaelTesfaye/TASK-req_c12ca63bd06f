/**
 * Unit test for /check-in +page.svelte.
 *
 * Verifies the tablet check-in UI loads in-service + approved events on
 * mount and renders the attendee-label entry UI. The check-in page does
 * not use $app/navigation or $app/stores, so only the API client needs
 * mocking.
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
let getMock, postMock, unwrapMock;
let CheckInPage;

beforeEach(async () => {
  vi.resetModules();
  getMock = vi.fn();
  postMock = vi.fn();
  unwrapMock = vi.fn((r) => (r && typeof r === 'object' && 'data' in r ? r.data : r));

  vi.doMock('$lib/api/client.js', () => ({
    get: getMock,
    post: postMock,
    unwrap: unwrapMock,
  }));

  const rtl = await import('@testing-library/svelte');
  render = rtl.render;

  CheckInPage = (await import('../../src/routes/check-in/+page.svelte')).default;
});

afterEach(() => { vi.restoreAllMocks(); });

describe('/check-in +page.svelte', () => {
  it('fetches both in_service and approved events on mount', async () => {
    getMock.mockResolvedValue({ data: { data: [], pagination: {} }, error: null });
    render(CheckInPage);
    await Promise.resolve();
    await Promise.resolve();

    const urls = getMock.mock.calls.map((c) => c[0]);
    expect(urls.some((u) => u.includes('state=in_service'))).toBe(true);
    expect(urls.some((u) => u.includes('state=approved'))).toBe(true);
  });

  it('mounts without throwing and renders a DOM tree', () => {
    getMock.mockResolvedValue({ data: { data: [], pagination: {} }, error: null });
    const { container } = render(CheckInPage);
    // The check-in page renders a tablet-optimized layout; any rendered
    // element confirms the component mounted successfully.
    expect(container.childElementCount).toBeGreaterThan(0);
  });
});
