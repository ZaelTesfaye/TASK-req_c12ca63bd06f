/**
 * Unit test for /login +page.svelte.
 *
 * Mounts the page with $app/navigation + API mocks. Covers the two
 * assertions the fix-instructions require: the page mounts with key UI,
 * and client-side validation fires (the interaction path). The happy-path
 * submit flow depends on Svelte 5 bind:value reactivity flushing across
 * fireEvent + form.submit, which is order-sensitive inside a single test
 * file; it lives in the E2E suite instead.
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
let postMock, gotoMock, loginMock;
let LoginPage;

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  for (const k of Object.keys(storage)) delete storage[k];
  // Clear any previously-rendered component DOM (belt-and-braces alongside
  // @testing-library/svelte/vitest's auto-cleanup).
  if (cleanup) cleanup();

  postMock = vi.fn();
  gotoMock = vi.fn();
  loginMock = vi.fn();

  vi.doMock('$lib/api/client.js', () => ({ get: vi.fn(), post: postMock }));
  vi.doMock('$lib/stores/auth.js', () => ({
    authStore: {
      login: loginMock,
      get: () => ({ user: null, permissions: [], roles: [] }),
      hasPermission: () => false,
    },
  }));
  vi.doMock('$app/navigation', () => ({ goto: gotoMock }));

  const rtl = await import('@testing-library/svelte');
  render = rtl.render;
  fireEvent = rtl.fireEvent;
  cleanup = rtl.cleanup;

  LoginPage = (await import('../../src/routes/login/+page.svelte')).default;
});

afterEach(() => {
  if (cleanup) cleanup();
  vi.restoreAllMocks();
});

describe('/login +page.svelte', () => {
  it('renders the sign-in form with username and password fields', () => {
    const { getByText, getByLabelText } = render(LoginPage);
    expect(getByText('Sign in to your account')).toBeTruthy();
    expect(getByLabelText('Username')).toBeTruthy();
    expect(getByLabelText('Password')).toBeTruthy();
    expect(getByText('Sign In')).toBeTruthy();
  });

  it('shows validation errors when the form is submitted with empty fields', async () => {
    const { container, findByText } = render(LoginPage);
    await fireEvent.submit(container.querySelector('form'));
    expect(await findByText('Username is required')).toBeTruthy();
    expect(await findByText('Password is required')).toBeTruthy();
    // Validation must short-circuit before the API call fires.
    expect(postMock).not.toHaveBeenCalled();
  });

  it('exposes a link to the register page', () => {
    const { getByText } = render(LoginPage);
    const link = getByText('Register');
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/register');
  });
});
