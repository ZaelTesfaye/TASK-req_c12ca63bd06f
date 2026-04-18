/**
 * Unit tests for the reports download helper.
 *
 * Exercises the code path used by the /reports and /inventory pages'
 * CSV-export actions: authenticated fetch -> blob -> trigger browser
 * download via a synthetic <a> click. The helper exists specifically so
 * pages don't use window.open (which drops the Bearer token).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// sessionStorage shim for the auth store import chain
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

let downloadReport;
let getMock;

beforeEach(async () => {
  vi.resetModules();
  // URL.createObjectURL / revokeObjectURL are not in jsdom by default
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  globalThis.URL.revokeObjectURL = vi.fn();

  // Mock the api client's `get` so the helper is tested in isolation from
  // the fetch/auth-refresh pipeline (which has its own tests).
  getMock = vi.fn();
  vi.doMock('../../src/lib/api/client.js', () => ({
    get: getMock,
  }));

  const mod = await import('../../src/lib/api/reports.js');
  downloadReport = mod.downloadReport;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('downloadReport', () => {
  it('returns the error object when the underlying get() fails', async () => {
    getMock.mockResolvedValue({ data: null, error: { status: 401, message: 'nope' } });
    const err = await downloadReport('/reports/inventory/export?x=1', 'inv.csv');
    expect(err).toEqual({ status: 401, message: 'nope' });
  });

  it('triggers a blob download with the given filename on success', async () => {
    getMock.mockResolvedValue({ data: 'item,qty\nflour,10', error: null });

    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(document.body, 'removeChild');
    const clickSpy = vi.fn();
    // Intercept createElement('a') so we can capture the click target
    const originalCreate = document.createElement.bind(document);
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = originalCreate(tag);
      if (tag === 'a') el.click = clickSpy;
      return el;
    });

    const err = await downloadReport('/reports/inventory/export?x=1', 'inv.csv');

    expect(err).toBeNull();
    expect(createSpy).toHaveBeenCalledWith('a');
    expect(appendSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('unwraps a { data: "<csv>" } envelope if the server wraps the CSV', async () => {
    getMock.mockResolvedValue({ data: { data: 'a,b\n1,2' }, error: null });
    const clickSpy = vi.fn();
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = originalCreate(tag);
      if (tag === 'a') el.click = clickSpy;
      return el;
    });

    const err = await downloadReport('/reports/events/export', 'events.csv');
    expect(err).toBeNull();
    expect(clickSpy).toHaveBeenCalled();
  });

  it('returns an error object when the server response has no CSV body', async () => {
    getMock.mockResolvedValue({ data: null, error: null });
    const err = await downloadReport('/reports/x', 'x.csv');
    expect(err).toBeTruthy();
    expect(err.message).toMatch(/no csv/i);
  });
});
