<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { get } from '$lib/api/client.js';
  import { authStore } from '$lib/stores/auth.js';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Pagination from '$lib/components/ui/Pagination.svelte';

  let events = $state([]);
  let pagination = $state({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  let loading = $state(true);
  let error = $state('');
  let stateFilter = $state('');
  let searchQuery = $state('');
  let sortBy = $state('created_at');
  let sortDir = $state('desc');

  const user = $derived(authStore.get());
  const canCreate = $derived(authStore.hasPermission('event:create'));

  $effect(() => {
    loadEvents();
  });

  async function loadEvents() {
    loading = true;
    error = '';
    try {
      const params = new URLSearchParams();
      params.set('page', String(pagination.page));
      params.set('pageSize', String(pagination.pageSize));
      if (stateFilter) params.set('state', stateFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      params.set('sortBy', sortBy);
      params.set('sortDir', sortDir);
      const { data, error: apiErr } = await get(`/events?${params}`);
      if (apiErr) { error = apiErr.message; return; }
      events = data?.data || [];
      pagination = data?.pagination || pagination;
    } catch (err) {
      error = 'Failed to load events';
    } finally {
      loading = false;
    }
  }

  function handlePageChange(newPage) {
    pagination.page = newPage;
    loadEvents();
  }

  function handleSort(col) {
    if (sortBy === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortBy = col; sortDir = 'asc'; }
    pagination.page = 1;
    loadEvents();
  }

  function handleFilterChange() {
    pagination.page = 1;
    loadEvents();
  }
</script>

<div class="p-6 max-w-7xl mx-auto">
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-gray-900">Events</h1>
    {#if canCreate}
      <a href="/events/new" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
        + Create Event
      </a>
    {/if}
  </div>

  <!-- Filters -->
  <div class="bg-white rounded-xl shadow p-4 mb-6 flex flex-wrap gap-4 items-end">
    <div>
      <label class="block text-xs font-medium text-gray-500 mb-1">Status</label>
      <select bind:value={stateFilter} onchange={handleFilterChange}
        class="px-3 py-2 border border-gray-300 rounded-lg text-sm">
        <option value="">All States</option>
        <option value="draft">Draft</option>
        <option value="submitted">Submitted</option>
        <option value="approved">Approved</option>
        <option value="in_service">In Service</option>
        <option value="closed">Closed</option>
      </select>
    </div>
    <div class="flex-1 min-w-[200px]">
      <label class="block text-xs font-medium text-gray-500 mb-1">Search</label>
      <input type="text" bind:value={searchQuery} placeholder="Search events..."
        class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        onkeydown={(e) => e.key === 'Enter' && handleFilterChange()} />
    </div>
    <button onclick={handleFilterChange} class="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium">
      Apply
    </button>
  </div>

  <!-- Table -->
  {#if loading}
    <div class="bg-white rounded-xl shadow p-8 text-center">
      <div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
      <p class="mt-4 text-gray-500">Loading events...</p>
    </div>
  {:else if error}
    <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
  {:else if events.length === 0}
    <div class="bg-white rounded-xl shadow p-12 text-center">
      <p class="text-gray-400 text-lg">No events found</p>
      {#if canCreate}
        <a href="/events/new" class="mt-4 inline-block text-blue-600 hover:underline">Create your first event</a>
      {/if}
    </div>
  {:else}
    <div class="bg-white rounded-xl shadow overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gray-50 border-b text-left text-gray-500">
              <th class="px-4 py-3 cursor-pointer hover:text-gray-700" onclick={() => handleSort('title')}>
                Title {sortBy === 'title' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th class="px-4 py-3 cursor-pointer hover:text-gray-700" onclick={() => handleSort('event_date')}>
                Date {sortBy === 'event_date' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th class="px-4 py-3">Headcount</th>
              <th class="px-4 py-3">Budget</th>
              <th class="px-4 py-3">Status</th>
              <th class="px-4 py-3 cursor-pointer hover:text-gray-700" onclick={() => handleSort('created_at')}>
                Created {sortBy === 'created_at' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
            </tr>
          </thead>
          <tbody>
            {#each events as event}
              <tr class="border-b last:border-0 hover:bg-gray-50 cursor-pointer" onclick={() => goto(`/events/${event.id}`)}>
                <td class="px-4 py-3 font-medium text-gray-900">{event.title}</td>
                <td class="px-4 py-3 text-gray-600">{event.event_date}</td>
                <td class="px-4 py-3 text-gray-600">{event.headcount}</td>
                <td class="px-4 py-3 text-gray-600">${Number(event.budget_amount).toLocaleString()}</td>
                <td class="px-4 py-3"><Badge text={event.state} variant={event.state} /></td>
                <td class="px-4 py-3 text-gray-400">{new Date(event.created_at).toLocaleDateString()}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="p-4 border-t">
        <Pagination page={pagination.page} pageSize={pagination.pageSize} total={pagination.total} onPageChange={handlePageChange} />
      </div>
    </div>
  {/if}
</div>
