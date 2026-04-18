<script>
  import { authStore } from '$lib/stores/auth.js';
  import { get } from '$lib/api/client.js';
  import Badge from '$lib/components/ui/Badge.svelte';

  let stats = $state(null);
  let loading = $state(true);
  let error = $state('');

  const user = $derived(authStore.get());
  const roles = $derived(user?.roles || []);

  $effect(() => {
    loadDashboard();
  });

  async function loadDashboard() {
    loading = true;
    try {
      const results = {};
      if (roles.includes('event_planner') || roles.includes('admin')) {
        const { data } = await get('/events?pageSize=5&sortBy=created_at&sortDir=desc');
        results.recentEvents = data?.data || [];
        results.eventCount = data?.pagination?.total || 0;
      }
      if (roles.includes('approver') || roles.includes('admin')) {
        const { data } = await get('/approvals/pending?pageSize=5');
        results.pendingApprovals = data?.data || [];
        results.approvalCount = data?.pagination?.total || 0;
      }
      if (roles.includes('resource_manager') || roles.includes('admin')) {
        const { data } = await get('/reservations?status=occupied&pageSize=5');
        results.activeReservations = data?.data || [];
        results.reservationCount = data?.pagination?.total || 0;
      }
      if (roles.includes('inventory_analyst') || roles.includes('admin')) {
        const { data } = await get('/inventory/anomalies?from_date=' + new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10) + '&to_date=' + new Date().toISOString().slice(0, 10));
        results.anomalies = data?.data || [];
        results.anomalyCount = data?.pagination?.total || results.anomalies?.length || 0;
      }
      stats = results;
    } catch (err) {
      error = 'Failed to load dashboard data';
    } finally {
      loading = false;
    }
  }
</script>

<div class="p-6 max-w-7xl mx-auto">
  <div class="mb-8">
    <h1 class="text-2xl font-bold text-gray-900">Welcome, {user?.username || 'User'}</h1>
    <p class="text-gray-500 mt-1">
      Roles: {#each roles as role, i}<Badge text={role.replace('_', ' ')} variant="info" />{#if i < roles.length - 1}&nbsp;{/if}{/each}
    </p>
  </div>

  {#if loading}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {#each [1,2,3,4] as _}
        <div class="bg-white rounded-xl shadow p-6 animate-pulse">
          <div class="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
          <div class="h-8 bg-gray-200 rounded w-1/3"></div>
        </div>
      {/each}
    </div>
  {:else if error}
    <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {#if roles.includes('event_planner') || roles.includes('admin')}
        <a href="/events" class="bg-white rounded-xl shadow p-6 hover:shadow-lg transition-shadow">
          <p class="text-sm font-medium text-gray-500">Events</p>
          <p class="text-3xl font-bold text-gray-900 mt-2">{stats?.eventCount || 0}</p>
          <p class="text-xs text-gray-400 mt-1">Total events</p>
        </a>
      {/if}
      {#if roles.includes('approver') || roles.includes('admin')}
        <a href="/approvals" class="bg-white rounded-xl shadow p-6 hover:shadow-lg transition-shadow">
          <p class="text-sm font-medium text-gray-500">Pending Approvals</p>
          <p class="text-3xl font-bold text-orange-600 mt-2">{stats?.approvalCount || 0}</p>
          <p class="text-xs text-gray-400 mt-1">Awaiting review</p>
        </a>
      {/if}
      {#if roles.includes('resource_manager') || roles.includes('admin')}
        <a href="/reservations" class="bg-white rounded-xl shadow p-6 hover:shadow-lg transition-shadow">
          <p class="text-sm font-medium text-gray-500">Active Reservations</p>
          <p class="text-3xl font-bold text-blue-600 mt-2">{stats?.reservationCount || 0}</p>
          <p class="text-xs text-gray-400 mt-1">Currently occupied</p>
        </a>
      {/if}
      {#if roles.includes('inventory_analyst') || roles.includes('admin')}
        <a href="/inventory" class="bg-white rounded-xl shadow p-6 hover:shadow-lg transition-shadow">
          <p class="text-sm font-medium text-gray-500">Anomalies</p>
          <p class="text-3xl font-bold text-red-600 mt-2">{stats?.anomalyCount || 0}</p>
          <p class="text-xs text-gray-400 mt-1">Past 7 days</p>
        </a>
      {/if}
    </div>

    <!-- Recent Events -->
    {#if stats?.recentEvents?.length > 0}
      <div class="bg-white rounded-xl shadow p-6 mb-6">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">Recent Events</h2>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="border-b text-left text-gray-500">
              <th class="pb-2 pr-4">Title</th><th class="pb-2 pr-4">Date</th><th class="pb-2 pr-4">Status</th><th class="pb-2">Budget</th>
            </tr></thead>
            <tbody>
              {#each stats.recentEvents as event}
                <tr class="border-b last:border-0 hover:bg-gray-50">
                  <td class="py-3 pr-4"><a href="/events/{event.id}" class="text-blue-600 hover:underline">{event.title}</a></td>
                  <td class="py-3 pr-4 text-gray-600">{event.event_date}</td>
                  <td class="py-3 pr-4"><Badge text={event.state} variant={event.state} /></td>
                  <td class="py-3 text-gray-600">${Number(event.budget_amount).toLocaleString()}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}

    <!-- Pending Approvals -->
    {#if stats?.pendingApprovals?.length > 0}
      <div class="bg-white rounded-xl shadow p-6">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">Pending Approvals</h2>
        <div class="space-y-3">
          {#each stats.pendingApprovals as approval}
            <a href="/approvals" class="flex items-center justify-between p-3 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors">
              <div>
                <p class="font-medium text-gray-900">{approval.approval_type?.replace('_', ' ')}</p>
                <p class="text-sm text-gray-500">Event #{approval.event_id?.slice(0, 8)}</p>
              </div>
              <Badge text="pending" variant="pending" />
            </a>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>
