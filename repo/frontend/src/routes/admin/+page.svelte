<script>
  import { get, post, del } from '$lib/api/client.js';
  import { authStore } from '$lib/stores/auth.js';
  import Badge from '$lib/components/ui/Badge.svelte';

  let activeTab = $state('users');
  let users = $state([]);
  let roles = $state([]);
  let backupRuns = $state([]);
  let dcJobs = $state([]);
  let cacheStats = $state(null);
  let loading = $state(true);
  let error = $state('');
  let actionLoading = $state('');

  // Role Assignment
  let assignUserId = $state('');
  let assignRoleName = $state('');
  // Manager Scope
  let scopeUserId = $state('');
  let scopeEventId = $state('');

  $effect(() => { loadTabData(); });

  async function loadTabData() {
    loading = true;
    error = '';
    try {
      if (activeTab === 'users') {
        const [uRes, rRes] = await Promise.all([get('/users?pageSize=100'), get('/admin/roles')]);
        users = uRes.data?.data || [];
        roles = rRes.data || [];
      } else if (activeTab === 'cache') {
        const { data } = await get('/admin/cache/stats');
        cacheStats = data;
      } else if (activeTab === 'backups') {
        const { data } = await get('/admin/backups/runs');
        backupRuns = data?.data || data || [];
      } else if (activeTab === 'data-collection') {
        const { data } = await get('/admin/data-collection/jobs?pageSize=50');
        dcJobs = data?.data || [];
      }
    } catch (e) { error = 'Failed to load data'; }
    loading = false;
  }

  function switchTab(tab) { activeTab = tab; loadTabData(); }

  async function assignRole() {
    if (!assignUserId || !assignRoleName) return;
    actionLoading = 'role';
    const { error: err } = await post(`/admin/users/${assignUserId}/roles`, { roleName: assignRoleName });
    if (err) error = err.message;
    else { assignUserId = ''; assignRoleName = ''; await loadTabData(); }
    actionLoading = '';
  }

  async function assignScope() {
    if (!scopeUserId || !scopeEventId) return;
    actionLoading = 'scope';
    const { error: err } = await post(`/admin/users/${scopeUserId}/manager-scopes`, { eventId: scopeEventId });
    if (err) error = err.message;
    else { scopeUserId = ''; scopeEventId = ''; }
    actionLoading = '';
  }

  async function purgeCache(key) {
    actionLoading = 'purge';
    const body = key ? { key } : {};
    const { error: err } = await post('/admin/cache/purge', body);
    if (err) error = err.message;
    else await loadTabData();
    actionLoading = '';
  }

  async function recordDrill() {
    actionLoading = 'drill';
    const { error: err } = await post('/admin/backups/restore-test', { drill_quarter: `Q${Math.ceil((new Date().getMonth() + 1) / 3)}-${new Date().getFullYear()}`, notes: 'Drill initiated from UI' });
    if (err) error = err.message;
    else await loadTabData();
    actionLoading = '';
  }

  async function requeueJob(jobId) {
    actionLoading = jobId;
    const { error: err } = await post(`/data-collection/jobs/${jobId}/requeue`);
    if (err) error = err.message;
    else await loadTabData();
    actionLoading = '';
  }
</script>

<div class="p-6 max-w-7xl mx-auto">
  <h1 class="text-2xl font-bold text-gray-900 mb-6">Administration</h1>

  {#if error}<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}<button onclick={() => error = ''} class="float-right font-bold">×</button></div>{/if}

  <!-- Tabs -->
  <div class="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6">
    {#each ['users', 'cache', 'backups', 'data-collection'] as tab}
      <button onclick={() => switchTab(tab)} class="px-4 py-2 rounded-md text-sm font-medium {activeTab === tab ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'}">
        {tab === 'data-collection' ? 'Data Collection' : tab.charAt(0).toUpperCase() + tab.slice(1)}
      </button>
    {/each}
  </div>

  {#if loading}
    <div class="bg-white rounded-xl shadow p-8 text-center"><div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div></div>
  {:else if activeTab === 'users'}
    <!-- Users & Roles -->
    <div class="space-y-6">
      <div class="bg-white rounded-xl shadow p-6">
        <h3 class="font-semibold text-gray-900 mb-4">Assign Role</h3>
        <div class="flex gap-3 items-end">
          <div class="flex-1"><label class="block text-xs text-gray-500 mb-1">User</label>
            <select bind:value={assignUserId} class="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="">Select user...</option>
              {#each users as u}<option value={u.id}>{u.username}</option>{/each}
            </select>
          </div>
          <div class="flex-1"><label class="block text-xs text-gray-500 mb-1">Role</label>
            <select bind:value={assignRoleName} class="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="">Select role...</option>
              {#each roles as r}<option value={r.name}>{r.name}</option>{/each}
            </select>
          </div>
          <button onclick={assignRole} disabled={actionLoading === 'role'} class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Assign</button>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow p-6">
        <h3 class="font-semibold text-gray-900 mb-4">Manager Scope</h3>
        <div class="flex gap-3 items-end">
          <div class="flex-1"><label class="block text-xs text-gray-500 mb-1">User ID</label><input type="text" bind:value={scopeUserId} class="w-full px-3 py-2 border rounded-lg text-sm" /></div>
          <div class="flex-1"><label class="block text-xs text-gray-500 mb-1">Event ID</label><input type="text" bind:value={scopeEventId} class="w-full px-3 py-2 border rounded-lg text-sm" /></div>
          <button onclick={assignScope} disabled={actionLoading === 'scope'} class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Assign</button>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow overflow-hidden">
        <table class="w-full text-sm">
          <thead><tr class="bg-gray-50 border-b text-left text-gray-500"><th class="px-4 py-3">Username</th><th class="px-4 py-3">Status</th><th class="px-4 py-3">Roles</th></tr></thead>
          <tbody>
            {#each users as u}
              <tr class="border-b last:border-0"><td class="px-4 py-3 font-medium">{u.username}</td><td class="px-4 py-3"><Badge text={u.status} variant={u.status === 'active' ? 'success' : 'error'} /></td>
                <td class="px-4 py-3 flex gap-1 flex-wrap">{#each (u.roles || []) as r}<Badge text={r.name || r} variant="info" />{/each}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {:else if activeTab === 'cache'}
    <div class="bg-white rounded-xl shadow p-6">
      <h3 class="font-semibold text-gray-900 mb-4">Cache Management</h3>
      <div class="grid grid-cols-2 gap-4 mb-6">
        <div class="bg-gray-50 p-4 rounded-lg"><p class="text-sm text-gray-500">Hits</p><p class="text-2xl font-bold">{cacheStats?.hits || 0}</p></div>
        <div class="bg-gray-50 p-4 rounded-lg"><p class="text-sm text-gray-500">Misses</p><p class="text-2xl font-bold">{cacheStats?.misses || 0}</p></div>
      </div>
      <div class="flex gap-2">
        <button onclick={() => purgeCache()} disabled={actionLoading === 'purge'} class="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">Purge All</button>
        {#each ['catalog:tree', 'recipes:approved', 'inventory:snapshot:today', 'entitlement:types', 'events:list'] as key}
          <button onclick={() => purgeCache(key)} class="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs">{key}</button>
        {/each}
      </div>
    </div>
  {:else if activeTab === 'backups'}
    <div class="bg-white rounded-xl shadow p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-semibold text-gray-900">Backup Runs</h3>
        <button onclick={recordDrill} disabled={actionLoading === 'drill'} class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Record Drill</button>
      </div>
      {#if backupRuns.length === 0}
        <p class="text-gray-400">No backup runs recorded</p>
      {:else}
        <table class="w-full text-sm">
          <thead><tr class="border-b text-left text-gray-500"><th class="pb-2">Date</th><th class="pb-2">Status</th><th class="pb-2">Tested</th></tr></thead>
          <tbody>
            {#each backupRuns as b}
              <tr class="border-b last:border-0"><td class="py-2">{new Date(b.started_at).toLocaleString()}</td><td class="py-2"><Badge text={b.status} variant={b.status === 'completed' ? 'success' : 'warning'} /></td><td class="py-2">{b.restore_tested ? 'Yes' : 'No'}</td></tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  {:else if activeTab === 'data-collection'}
    <div class="bg-white rounded-xl shadow p-6">
      <h3 class="font-semibold text-gray-900 mb-4">Data Collection Jobs</h3>
      {#if dcJobs.length === 0}
        <p class="text-gray-400">No jobs found</p>
      {:else}
        <table class="w-full text-sm">
          <thead><tr class="border-b text-left text-gray-500"><th class="pb-2">Source</th><th class="pb-2">Status</th><th class="pb-2">Review</th><th class="pb-2">Actions</th></tr></thead>
          <tbody>
            {#each dcJobs as j}
              <tr class="border-b last:border-0">
                <td class="py-2">{j.source_name}</td>
                <td class="py-2"><Badge text={j.status} variant={j.status === 'completed' ? 'success' : j.status === 'failed' ? 'error' : 'pending'} /></td>
                <td class="py-2">{j.manual_review_required ? 'Yes' : 'No'}</td>
                <td class="py-2">
                  {#if j.status === 'failed'}
                    <button onclick={() => requeueJob(j.id)} disabled={actionLoading === j.id} class="px-2 py-1 bg-blue-600 text-white rounded text-xs">Requeue</button>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  {/if}
</div>
