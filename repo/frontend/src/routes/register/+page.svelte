<script>
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth.js';
  import { post } from '$lib/api/client.js';

  let username = $state('');
  let password = $state('');
  let confirmPassword = $state('');
  let error = $state('');
  let loading = $state(false);
  let fieldErrors = $state({});

  let passwordStrength = $derived(() => {
    if (!password) return { score: 0, label: '', color: 'bg-gray-200' };
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
    const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-blue-500', 'bg-green-500'];
    return { score, label: labels[Math.min(score, 4)] || '', color: colors[Math.min(score, 4)] || 'bg-gray-200' };
  });

  function validate() {
    const errs = {};
    if (!username.trim()) errs.username = 'Username is required';
    else if (username.length < 3) errs.username = 'Username must be at least 3 characters';
    else if (username.length > 100) errs.username = 'Username must be at most 100 characters';
    if (!password) errs.password = 'Password is required';
    else if (password.length < 8) errs.password = 'Password must be at least 8 characters';
    if (password !== confirmPassword) errs.confirmPassword = 'Passwords do not match';
    fieldErrors = errs;
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    loading = true;
    error = '';
    try {
      const { error: regError } = await post('/auth/register', { username: username.trim(), password });
      if (regError) { error = regError.message || 'Registration failed'; loading = false; return; }
      const { data, error: loginError } = await post('/auth/login', { username: username.trim(), password });
      if (loginError) { error = 'Registered but login failed. Please sign in.'; loading = false; return; }
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
      <h1 class="text-3xl font-bold text-gray-900">Create Account</h1>
      <p class="mt-2 text-gray-600">Join the Hospitality Ops platform</p>
    </div>
    <form onsubmit={handleSubmit} class="bg-white shadow-lg rounded-xl p-8 space-y-6">
      {#if error}
        <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      {/if}
      <div>
        <label for="username" class="block text-sm font-medium text-gray-700 mb-1">Username</label>
        <input id="username" type="text" bind:value={username} disabled={loading}
          class="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 {fieldErrors.username ? 'border-red-400' : 'border-gray-300'}"
          placeholder="Choose a username" />
        {#if fieldErrors.username}<p class="mt-1 text-xs text-red-500">{fieldErrors.username}</p>{/if}
      </div>
      <div>
        <label for="password" class="block text-sm font-medium text-gray-700 mb-1">Password</label>
        <input id="password" type="password" bind:value={password} disabled={loading}
          class="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 {fieldErrors.password ? 'border-red-400' : 'border-gray-300'}"
          placeholder="Min 8 characters" />
        {#if password}
          <div class="mt-2 flex items-center gap-2">
            <div class="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div class="{passwordStrength().color} h-full transition-all rounded-full" style="width: {passwordStrength().score * 20}%"></div>
            </div>
            <span class="text-xs text-gray-500">{passwordStrength().label}</span>
          </div>
        {/if}
        {#if fieldErrors.password}<p class="mt-1 text-xs text-red-500">{fieldErrors.password}</p>{/if}
      </div>
      <div>
        <label for="confirmPassword" class="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
        <input id="confirmPassword" type="password" bind:value={confirmPassword} disabled={loading}
          class="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 {fieldErrors.confirmPassword ? 'border-red-400' : 'border-gray-300'}"
          placeholder="Re-enter your password" />
        {#if fieldErrors.confirmPassword}<p class="mt-1 text-xs text-red-500">{fieldErrors.confirmPassword}</p>{/if}
      </div>
      <button type="submit" disabled={loading}
        class="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
        {#if loading}
          <span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
          Creating account...
        {:else}
          Create Account
        {/if}
      </button>
      <p class="text-center text-sm text-gray-600">
        Already have an account? <a href="/login" class="text-blue-600 hover:underline font-medium">Sign In</a>
      </p>
    </form>
  </div>
</div>
