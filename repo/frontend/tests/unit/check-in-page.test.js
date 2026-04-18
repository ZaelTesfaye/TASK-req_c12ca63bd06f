/**
 * Unit test for /check-in +page.svelte.
 * Mount + initial event-list fetches.
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
let CheckInPage;

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  if (cleanup) cleanup();

  getMock = vi.fn().mockResolvedValue({ data: { data: [] }, error: null });

  vi.doMock('$lib/api/client.js', () => ({
    get: getMock,
    post: vi.fn(),
    unwrap: (r) => (r && typeof r === 'object' && 'data' in r ? r.data : r),
  }));

  const rtl = await import('@testing-library/svelte');
  render = rtl.render;
  cleanup = rtl.cleanup;

  CheckInPage = (await import('../../src/routes/check-in/+page.svelte')).default;
});

afterEach(() => {
  if (cleanup) cleanup();
  vi.restoreAllMocks();
});

describe('/check-in +page.svelte', () => {
  it('fetches in_service and approved events on mount', async () => {
    render(CheckInPage);
    await new Promise((r) => setTimeout(r, 50));
    expect(getMock).toHaveBeenCalled();
    const urls = getMock.mock.calls.map((c) => c[0]);
    expect(urls.some((u) => u.includes('state=in_service'))).toBe(true);
    expect(urls.some((u) => u.includes('state=approved'))).toBe(true);
  });

  it('mounts without throwing', () => {
    const { container } = render(CheckInPage);
    expect(container.childElementCount).toBeGreaterThan(0);
  });
});
