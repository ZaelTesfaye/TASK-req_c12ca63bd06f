/**
 * Unit test for /reservations +page.svelte.
 *
 * Covers: initial list load, row render, and the approve-overtime modal
 * justification validation (the fix for the previously-broken overtime
 * submission is the page's most important behavior — this test pins the
 * justification gate at the unit level).
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
let ReservationsPage;

const PENDING_OVERTIME_ROW = {
  id: 'res-1',
  event_id: 'evt-1',
  event_title: 'Gala',
  resource_id: 'r-1',
  resource_name: 'Ballroom',
  status: 'occupied',
  scheduled_start_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
  scheduled_end_at: new Date(Date.now() - 3600 * 1000).toISOString(),
  overtime_minutes: 45,
  overtime_pending_approval: true,
};

beforeEach(async () => {
  vi.resetModules();
  getMock = vi.fn();
  postMock = vi.fn();

  vi.doMock('$lib/api/client.js', () => ({ get: getMock, post: postMock }));
  vi.doMock('$lib/stores/auth.js', () => ({
    authStore: {
      get: () => ({}),
      hasPermission: (p) =>
        ['reservation:approve', 'reservation:operate', 'reservation:overtime_approve'].includes(p),
    },
  }));

  const rtl = await import('@testing-library/svelte');
  render = rtl.render;
  fireEvent = rtl.fireEvent;

  ReservationsPage = (await import('../../src/routes/reservations/+page.svelte')).default;
});

afterEach(() => { vi.restoreAllMocks(); });

describe('/reservations +page.svelte', () => {
  it('fetches /reservations on mount with pagination params', async () => {
    getMock.mockResolvedValue({ data: { data: [], pagination: { page: 1, pageSize: 20, total: 0 } }, error: null });
    render(ReservationsPage);
    await Promise.resolve();
    await Promise.resolve();
    const first = getMock.mock.calls[0][0];
    expect(first.startsWith('/reservations?')).toBe(true);
    expect(first).toMatch(/page=1/);
  });

  it('renders the page heading and an empty state when no reservations exist', async () => {
    getMock.mockResolvedValue({ data: { data: [], pagination: { page: 1, pageSize: 20, total: 0 } }, error: null });
    const { getByText, findByText } = render(ReservationsPage);
    expect(getByText('Reservations')).toBeTruthy();
    expect(await findByText('No reservations found')).toBeTruthy();
  });

  it('renders an Approve OT button for rows with overtime pending approval', async () => {
    getMock.mockResolvedValue({
      data: { data: [PENDING_OVERTIME_ROW], pagination: { page: 1, pageSize: 20, total: 1 } },
      error: null,
    });
    const { findByText } = render(ReservationsPage);
    expect(await findByText(/Approve OT/i)).toBeTruthy();
  });

  it('Confirm stays disabled until justification is provided in the approve-overtime modal', async () => {
    getMock.mockResolvedValue({
      data: { data: [PENDING_OVERTIME_ROW], pagination: { page: 1, pageSize: 20, total: 1 } },
      error: null,
    });
    const { findByText, container } = render(ReservationsPage);

    const btn = await findByText(/Approve OT/i);
    await fireEvent.click(btn);

    const confirmBtn = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent.trim() === 'Confirm');
    expect(confirmBtn).toBeTruthy();
    expect(confirmBtn.disabled).toBe(true);

    const textarea = container.querySelector('#overtime-justification');
    expect(textarea).toBeTruthy();
    await fireEvent.input(textarea, { target: { value: 'Guests overstayed, approved on-site.' } });
    await Promise.resolve();
    expect(confirmBtn.disabled).toBe(false);
  });
});
