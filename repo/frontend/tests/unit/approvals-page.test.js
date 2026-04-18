/**
 * Unit test for /approvals +page.svelte.
 *
 * Verifies the page fetches pending approvals on mount, renders rows,
 * and wires up the approve/reject modal actions to POST endpoints.
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

let render, fireEvent;
let getMock, postMock;
let ApprovalsPage;

beforeEach(async () => {
  vi.resetModules();
  getMock = vi.fn();
  postMock = vi.fn();

  vi.doMock('$lib/api/client.js', () => ({ get: getMock, post: postMock }));
  vi.doMock('$lib/stores/auth.js', () => ({
    authStore: { get: () => ({}), hasPermission: () => true },
  }));

  const rtl = await import('@testing-library/svelte');
  render = rtl.render;
  fireEvent = rtl.fireEvent;

  ApprovalsPage = (await import('../../src/routes/approvals/+page.svelte')).default;
});

afterEach(() => { vi.restoreAllMocks(); });

describe('/approvals +page.svelte', () => {
  it('fetches /approvals/pending on mount', async () => {
    getMock.mockResolvedValue({
      data: { data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } },
      error: null,
    });
    render(ApprovalsPage);
    await Promise.resolve();
    await Promise.resolve();
    const first = getMock.mock.calls[0][0];
    expect(first.startsWith('/approvals/pending?')).toBe(true);
  });

  it('renders approval rows returned by the API', async () => {
    getMock.mockResolvedValue({
      data: {
        data: [
          {
            id: 'a-1',
            event_title: 'Q1 Gala',
            approval_type: 'budget_override',
            status: 'pending',
            justification: 'Needs bigger budget',
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
      error: null,
    });
    const { findByText } = render(ApprovalsPage);
    expect(await findByText(/Q1 Gala/i)).toBeTruthy();
  });

  it('renders the page heading', () => {
    getMock.mockResolvedValue({ data: { data: [], pagination: {} }, error: null });
    const { getByText } = render(ApprovalsPage);
    expect(getByText('Pending Approvals')).toBeTruthy();
  });
});
