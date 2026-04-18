/**
 * Unit test for /register +page.svelte.
 * Mount + key UI present.
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

let render, fireEvent, cleanup;
let postMock;
let RegisterPage;

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  if (cleanup) cleanup();

  postMock = vi.fn();

  vi.doMock('$lib/api/client.js', () => ({ get: vi.fn(), post: postMock }));
  vi.doMock('$lib/stores/auth.js', () => ({
    authStore: { login: vi.fn(), get: () => ({}), hasPermission: () => false },
  }));
  vi.doMock('$app/navigation', () => ({ goto: vi.fn() }));

  const rtl = await import('@testing-library/svelte');
  render = rtl.render;
  fireEvent = rtl.fireEvent;
  cleanup = rtl.cleanup;

  RegisterPage = (await import('../../src/routes/register/+page.svelte')).default;
});

afterEach(() => {
  if (cleanup) cleanup();
  vi.restoreAllMocks();
});

describe('/register +page.svelte', () => {
  it('renders the registration form', () => {
    const { getByRole, getByLabelText, getAllByText } = render(RegisterPage);
    // "Create Account" appears twice in the page (the <h1> heading and the
    // submit button label). Pin each match to its element role instead of
    // a plain text query to avoid a "multiple matches" error.
    expect(getByRole('heading', { name: 'Create Account' })).toBeTruthy();
    expect(getAllByText('Create Account').length).toBeGreaterThanOrEqual(2);
    expect(getByLabelText('Username')).toBeTruthy();
    expect(getByLabelText('Password')).toBeTruthy();
  });

  it('validates empty submit before calling the API', async () => {
    const { container, findByText } = render(RegisterPage);
    await fireEvent.submit(container.querySelector('form'));
    expect(await findByText('Username is required')).toBeTruthy();
    expect(postMock).not.toHaveBeenCalled();
  });
});
