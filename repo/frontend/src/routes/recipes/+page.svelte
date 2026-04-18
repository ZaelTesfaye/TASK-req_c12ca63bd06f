<script>
  import { goto } from '$app/navigation';
  import { get } from '$lib/api/client.js';
  import { authStore } from '$lib/stores/auth.js';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Pagination from '$lib/components/ui/Pagination.svelte';

  let recipes = $state([]);
  let pagination = $state({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  let loading = $state(true);
  let error = $state('');
  let statusFilter = $state('');
  const canCreate = $derived(authStore.hasPermission('recipe:create'));

  $effect(() => { loadRecipes(); });

  async function loadRecipes() {
    loading = true;
    const params = new URLSearchParams({ page: pagination.page, pageSize: pagination.pageSize });
    if (statusFilter) params.set('status', statusFilter);
    const { data, error: err } = await get(`/recipes?${params}`);
    if (err) error = err.message;
    else { recipes = data?.data || []; pagination = data?.pagination || pagination; }
    loading = false;
  }

  function handlePageChange(p) { pagination.page = p; loadRecipes(); }
</script>

<div class="p-6 max-w-7xl mx-auto">
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-gray-900">Recipes</h1>
    {#if canCreate}
      <a href="/recipes/new" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">+ Create Recipe</a>
    {/if}
  </div>

  <div class="bg-white rounded-xl shadow p-4 mb-6 flex gap-4">
    <div>
      <label class="block text-xs font-medium text-gray-500 mb-1">Status</label>
      <select bind:value={statusFilter} onchange={() => { pagination.page = 1; loadRecipes(); }} class="px-3 py-2 border border-gray-300 rounded-lg text-sm">
        <option value="">All</option>
        <option value="draft">Draft</option>
        <option value="submitted_for_review">Under Review</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
      </select>
    </div>
  </div>

  {#if loading}
    <div class="bg-white rounded-xl shadow p-8 text-center">
      <div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
    </div>
  {:else if recipes.length === 0}
    <div class="bg-white rounded-xl shadow p-12 text-center text-gray-400">No recipes found</div>
  {:else}
    <div class="bg-white rounded-xl shadow overflow-hidden">
      <table class="w-full text-sm">
        <thead><tr class="bg-gray-50 border-b text-left text-gray-500">
          <th class="px-4 py-3">Title</th><th class="px-4 py-3">Slug</th><th class="px-4 py-3">Version</th><th class="px-4 py-3">Status</th><th class="px-4 py-3">Difficulty</th><th class="px-4 py-3">Time (min)</th>
        </tr></thead>
        <tbody>
          {#each recipes as r}
            <tr class="border-b last:border-0 hover:bg-gray-50 cursor-pointer" onclick={() => goto(`/recipes/${r.id}`)}>
              <td class="px-4 py-3 font-medium text-gray-900">{r.current_version_title || r.slug}</td>
              <td class="px-4 py-3 text-gray-500">{r.slug}</td>
              <td class="px-4 py-3">{r.current_version_no || '—'}</td>
              <td class="px-4 py-3"><Badge text={r.current_version_status || 'draft'} variant={r.current_version_status || 'draft'} /></td>
              <td class="px-4 py-3 text-gray-500">{r.difficulty || '—'}</td>
              <td class="px-4 py-3 text-gray-500">{r.time_estimate_minutes || '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <div class="p-4 border-t"><Pagination page={pagination.page} pageSize={pagination.pageSize} total={pagination.total} onPageChange={handlePageChange} /></div>
    </div>
  {/if}
</div>
