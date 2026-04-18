<script>
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth.js';
  import { post } from '$lib/api/client.js';

  let username = $state('');
  let password = $state('');
  let error = $state('');
  let loading = $state(false);
  let fieldErrors = $state({});

  function validate() {
    const errs = {};
    if (!username.trim()) errs.username = 'Username is required';
    else if (username.length < 3) errs.username = 'Username must be at least 3 characters';
    if (!password) errs.password = 'Password is required';
    else if (password.length < 8) errs.password = 'Password must be at least 8 characters';
    fieldErrors = errs;
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    loading = true;
    error = '';
    try {
      const { data, error: apiError } = await post('/auth/login', { username: username.trim(), password });
      if (apiError) {
        error = apiError.message || 'Login failed';
        loading = false;
        return;
      }
      authStore.login({
        user: data.user,
        token: data.accessToken,
        refreshToken: data.refreshToken,
        permissions: data.user?.permissions || [],
        roles: data.user?.roles || [],
      });
      goto('/dashboard');
    } catch (err) {
      error = 'An unexpected error occurred';
    } finally {
      loading = false;
    }
  }
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-50 px-4">
  <div class="max-w-md w-full">
    <div class="text-center mb-8">
      <h1 class="text-3xl font-bold text-gray-900">Hospitality Ops</h1>
      <p class="mt-2 text-gray-600">Sign in to your account</p>
    </div>

    <form onsubmit={handleSubmit} class="bg-white shadow-lg rounded-xl p-8 space-y-6">
      {#if error}
        <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      {/if}

      <div>
        <label for="username" class="block text-sm font-medium text-gray-700 mb-1">Username</label>
        <input
          id="username"
          type="text"
          bind:value={username}
          class="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 {fieldErrors.username ? 'border-red-400' : 'border-gray-300'}"
          placeholder="Enter your username"
          disabled={loading}
        />
        {#if fieldErrors.username}<p class="mt-1 text-xs text-red-500">{fieldErrors.username}</p>{/if}
      </div>

      <div>
        <label for="password" class="block text-sm font-medium text-gray-700 mb-1">Password</label>
        <input
          id="password"
          type="password"
          bind:value={password}
          class="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 {fieldErrors.password ? 'border-red-400' : 'border-gray-300'}"
          placeholder="Enter your password"
          disabled={loading}
        />
        {#if fieldErrors.password}<p class="mt-1 text-xs text-red-500">{fieldErrors.password}</p>{/if}
      </div>

      <button
        type="submit"
        disabled={loading}
        class="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        {#if loading}
          <span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
          Signing in...
        {:else}
          Sign In
        {/if}
      </button>

      <p class="text-center text-sm text-gray-600">
        Don't have an account? <a href="/register" class="text-blue-600 hover:underline font-medium">Register</a>
      </p>
    </form>
  </div>
</div>
