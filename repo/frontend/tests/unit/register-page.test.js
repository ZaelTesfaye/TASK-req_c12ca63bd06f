/**
 * Unit test for /register +page.svelte.
 *
 * Mounts the page with $app/navigation + API mocks; verifies the form
 * renders, password-mismatch validation blocks submission, and a valid
 * registration issues POST /auth/register followed by POST /auth/login.
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
let postMock, gotoMock, loginMock;
let RegisterPage;

beforeEach(async () => {
  vi.resetModules();
  postMock = vi.fn();
  gotoMock = vi.fn();
  loginMock = vi.fn();

  vi.doMock('$lib/api/client.js', () => ({ get: vi.fn(), post: postMock }));
  vi.doMock('$lib/stores/auth.js', () => ({
    authStore: { login: loginMock, get: () => ({}), hasPermission: () => false },
  }));
  vi.doMock('$app/navigation', () => ({ goto: gotoMock }));

  const rtl = await import('@testing-library/svelte');
  render = rtl.render;
  fireEvent = rtl.fireEvent;

  RegisterPage = (await import('../../src/routes/register/+page.svelte')).default;
});

afterEach(() => { vi.restoreAllMocks(); });

describe('/register +page.svelte', () => {
  it('renders the registration form', () => {
    const { getByText } = render(RegisterPage);
    expect(getByText('Create Account')).toBeTruthy();
    expect(getByText('Username')).toBeTruthy();
    expect(getByText('Password')).toBeTruthy();
  });

  it('blocks submission when passwords do not match', async () => {
    const { container, findByText } = render(RegisterPage);
    const inputs = container.querySelectorAll('input');
    // Inputs: username, password, confirmPassword
    await fireEvent.input(inputs[0], { target: { value: 'newuser' } });
    await fireEvent.input(inputs[1], { target: { value: 'password123' } });
    await fireEvent.input(inputs[2], { target: { value: 'different-password' } });
    await fireEvent.submit(container.querySelector('form'));

    expect(await findByText(/Passwords do not match/i)).toBeTruthy();
    expect(postMock).not.toHaveBeenCalled();
  });

  it('calls POST /auth/register then POST /auth/login and navigates to /dashboard on success', async () => {
    postMock
      .mockResolvedValueOnce({ data: { user: { id: 'u1', username: 'newuser' } }, error: null })
      .mockResolvedValueOnce({
        data: {
          user: { id: 'u1', username: 'newuser', roles: ['event_planner'], permissions: [] },
          accessToken: 'at',
          refreshToken: 'rt',
        },
        error: null,
      });

    const { container } = render(RegisterPage);
    const inputs = container.querySelectorAll('input');
    await fireEvent.input(inputs[0], { target: { value: 'newuser' } });
    await fireEvent.input(inputs[1], { target: { value: 'password123' } });
    await fireEvent.input(inputs[2], { target: { value: 'password123' } });
    await fireEvent.submit(container.querySelector('form'));

    await Promise.resolve();
    await Promise.resolve();

    expect(postMock.mock.calls[0][0]).toBe('/auth/register');
    expect(postMock.mock.calls[1][0]).toBe('/auth/login');
    expect(gotoMock).toHaveBeenCalledWith('/dashboard');
  });
});
