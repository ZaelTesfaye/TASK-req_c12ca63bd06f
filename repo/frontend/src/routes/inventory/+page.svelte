<script>
  import { get, post } from '$lib/api/client.js';
  import { downloadReport } from '$lib/api/reports.js';
  import { authStore } from '$lib/stores/auth.js';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Pagination from '$lib/components/ui/Pagination.svelte';

  let items = $state([]);
  let snapshots = $state([]);
  let anomalies = $state([]);
  let gaps = $state([]);
  let pagination = $state({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  let loading = $state(true);
  let error = $state('');
  let activeTab = $state('items');
  let selectedItemId = $state('');
  let fromDate = $state(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  let toDate = $state(new Date().toISOString().slice(0, 10));
  let resolveTarget = $state(null); // holds the gap row { item_id, missing_date } being resolved
  let resolveNotes = $state('');
  let actionLoading = $state('');

  const canResolve = $derived(authStore.hasPermission('inventory:resolve_gap'));
  const canExport = $derived(authStore.hasPermission('inventory:export'));

  $effect(() => { loadData(); });

  async function loadData() {
    loading = true;
    if (activeTab === 'items') {
      const { data } = await get(`/inventory/items?page=${pagination.page}&pageSize=${pagination.pageSize}`);
      items = data?.data || [];
      pagination = data?.pagination || pagination;
    } else if (activeTab === 'snapshots' && selectedItemId) {
      const { data } = await get(`/inventory/snapshots?item_id=${selectedItemId}&from_date=${fromDate}&to_date=${toDate}`);
      snapshots = data?.data || [];
    } else if (activeTab === 'anomalies') {
      const { data } = await get(`/inventory/anomalies?from_date=${fromDate}&to_date=${toDate}`);
      anomalies = data?.data || data || [];
    } else if (activeTab === 'gaps') {
      const { data } = await get(`/inventory/gaps?from_date=${fromDate}&to_date=${toDate}`);
      gaps = data?.data || data || [];
    }
    loading = false;
  }

  async function resolveGap() {
    if (!resolveTarget) return;
    actionLoading = 'resolve';
    const payload = {
      missing_date: resolveTarget.missing_date,
      notes: resolveNotes,
    };
    const { error: err } = await post(
      `/inventory/gaps/${resolveTarget.item_id}/resolve`,
      payload,
    );
    if (err) error = err.message;
    else { resolveTarget = null; resolveNotes = ''; await loadData(); }
    actionLoading = '';
  }

  async function exportReport() {
    if (gaps.length > 0) { error = 'Cannot export: unresolved gaps exist. Please resolve them first.'; return; }
    const params = new URLSearchParams({ from_date: fromDate, to_date: toDate, format: 'csv' });
    const err = await downloadReport(
      `/reports/inventory/export?${params}`,
      `inventory-${fromDate}-to-${toDate}.csv`,
    );
    if (err) error = `Export failed: ${err.message}`;
  }

  function switchTab(tab) { activeTab = tab; pagination.page = 1; loadData(); }
</script>

<div class="p-6 max-w-7xl mx-auto">
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-gray-900">Inventory</h1>
    {#if canExport}
      <button onclick={exportReport} class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">Export CSV</button>
    {/if}
  </div>

  {#if error}<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}<button onclick={() => error = ''} class="float-right font-bold">×</button></div>{/if}

  <!-- Tabs -->
  <div class="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6">
    {#each ['items', 'snapshots', 'anomalies', 'gaps'] as tab}
      <button onclick={() => switchTab(tab)} class="px-4 py-2 rounded-md text-sm font-medium transition-colors {activeTab === tab ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'}">
        {tab.charAt(0).toUpperCase() + tab.slice(1)}
        {#if tab === 'anomalies' && anomalies.length > 0}<span class="ml-1 bg-red-100 text-red-600 text-xs px-1.5 py-0.5 rounded-full">{anomalies.length}</span>{/if}
        {#if tab === 'gaps' && gaps.length > 0}<span class="ml-1 bg-orange-100 text-orange-600 text-xs px-1.5 py-0.5 rounded-full">{gaps.length}</span>{/if}
      </button>
    {/each}
  </div>

  <!-- Date Range Filter -->
  {#if activeTab !== 'items'}
    <div class="bg-white rounded-xl shadow p-4 mb-6 flex flex-wrap gap-4 items-end">
      {#if activeTab === 'snapshots'}
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">Item</label>
          <select bind:value={selectedItemId} onchange={loadData} class="px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="">Select item...</option>
            {#each items as item}<option value={item.id}>{item.name} ({item.kind})</option>{/each}
          </select>
        </div>
      {/if}
      <div><label class="block text-xs font-medium text-gray-500 mb-1">From</label><input type="date" bind:value={fromDate} class="px-3 py-2 border border-gray-300 rounded-lg text-sm" /></div>
      <div><label class="block text-xs font-medium text-gray-500 mb-1">To</label><input type="date" bind:value={toDate} class="px-3 py-2 border border-gray-300 rounded-lg text-sm" /></div>
      <button onclick={loadData} class="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm">Apply</button>
    </div>
  {/if}

  {#if loading}
    <div class="bg-white rounded-xl shadow p-8 text-center"><div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div></div>
  {:else if activeTab === 'items'}
    <div class="bg-white rounded-xl shadow overflow-hidden">
      <table class="w-full text-sm">
        <thead><tr class="bg-gray-50 border-b text-left text-gray-500"><th class="px-4 py-3">Name</th><th class="px-4 py-3">Kind</th><th class="px-4 py-3">Unit</th><th class="px-4 py-3">Qty</th><th class="px-4 py-3">Price</th></tr></thead>
        <tbody>
          {#each items as item}
            <tr class="border-b last:border-0 hover:bg-gray-50 cursor-pointer" onclick={() => { selectedItemId = item.id; switchTab('snapshots'); }}>
              <td class="px-4 py-3 font-medium">{item.name}</td>
              <td class="px-4 py-3"><Badge text={item.kind} variant={item.kind === 'ingredient' ? 'info' : 'success'} /></td>
              <td class="px-4 py-3 text-gray-500">{item.unit}</td>
              <td class="px-4 py-3">{Number(item.current_quantity).toLocaleString()}</td>
              <td class="px-4 py-3">${Number(item.current_unit_price).toFixed(2)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <div class="p-4 border-t"><Pagination page={pagination.page} pageSize={pagination.pageSize} total={pagination.total} onPageChange={(p) => { pagination.page = p; loadData(); }} /></div>
    </div>
  {:else if activeTab === 'snapshots'}
    <div class="bg-white rounded-xl shadow overflow-hidden">
      {#if snapshots.length === 0}
        <p class="p-8 text-center text-gray-400">{selectedItemId ? 'No snapshots in range' : 'Select an item'}</p>
      {:else}
        <table class="w-full text-sm">
          <thead><tr class="bg-gray-50 border-b text-left text-gray-500"><th class="px-4 py-3">Date</th><th class="px-4 py-3">Quantity</th><th class="px-4 py-3">Price</th></tr></thead>
          <tbody>
            {#each snapshots as s}
              <tr class="border-b last:border-0"><td class="px-4 py-3">{s.snapshot_date}</td><td class="px-4 py-3">{s.quantity}</td><td class="px-4 py-3">${Number(s.unit_price).toFixed(2)}</td></tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  {:else if activeTab === 'anomalies'}
    <div class="bg-white rounded-xl shadow overflow-hidden">
      {#if anomalies.length === 0}
        <p class="p-8 text-center text-gray-400">No anomalies detected</p>
      {:else}
        <table class="w-full text-sm">
          <thead><tr class="bg-gray-50 border-b text-left text-gray-500"><th class="px-4 py-3">Item</th><th class="px-4 py-3">Date</th><th class="px-4 py-3">Change</th><th class="px-4 py-3">Type</th></tr></thead>
          <tbody>
            {#each anomalies as a}
              <tr class="border-b last:border-0 bg-red-50">
                <td class="px-4 py-3 font-medium">{a.item_name || a.item_id?.slice(0,8)}</td>
                <td class="px-4 py-3">{a.snapshot_date}</td>
                <td class="px-4 py-3 text-red-600 font-medium">{a.change_percent ? a.change_percent.toFixed(1) + '%' : 'N/A'}</td>
                <td class="px-4 py-3"><Badge text={a.anomaly_type || 'swing'} variant="error" /></td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  {:else if activeTab === 'gaps'}
    <div class="bg-white rounded-xl shadow overflow-hidden">
      {#if gaps.length === 0}
        <p class="p-8 text-center text-gray-400">No gaps found</p>
      {:else}
        <table class="w-full text-sm">
          <thead><tr class="bg-gray-50 border-b text-left text-gray-500"><th class="px-4 py-3">Item</th><th class="px-4 py-3">Missing Date</th><th class="px-4 py-3">Actions</th></tr></thead>
          <tbody>
            {#each gaps as g}
              <tr class="border-b last:border-0 bg-orange-50">
                <td class="px-4 py-3 font-medium">{g.item_name || g.item_id?.slice(0,8)}</td>
                <td class="px-4 py-3">{g.missing_date}</td>
                <td class="px-4 py-3">
                  {#if canResolve}
                    {#if resolveTarget && resolveTarget.item_id === g.item_id && resolveTarget.missing_date === g.missing_date}
                      <div class="flex gap-2">
                        <input type="text" bind:value={resolveNotes} placeholder="Resolution notes" class="px-2 py-1 border rounded text-xs flex-1" />
                        <button onclick={resolveGap} disabled={actionLoading === 'resolve'} class="px-2 py-1 bg-green-600 text-white rounded text-xs">Save</button>
                      </div>
                    {:else}
                      <button onclick={() => resolveTarget = { item_id: g.item_id, missing_date: g.missing_date }} class="px-2 py-1 bg-blue-600 text-white rounded text-xs">Resolve</button>
                    {/if}
                  {:else}
                    <Badge text="Unresolved" variant="warning" />
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
