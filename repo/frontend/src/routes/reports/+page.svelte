<script>
  import { get } from '$lib/api/client.js';
  import { downloadReport } from '$lib/api/reports.js';
  import { authStore } from '$lib/stores/auth.js';

  let fromDate = $state(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  let toDate = $state(new Date().toISOString().slice(0, 10));
  let error = $state('');
  let gapsExist = $state(false);
  let loading = $state(false);

  const canExportInventory = $derived(authStore.hasPermission('inventory:export'));
  const canExportReports = $derived(authStore.hasPermission('reports:export'));

  $effect(() => { checkGaps(); });

  async function checkGaps() {
    const { data } = await get(`/inventory/gaps?from_date=${fromDate}&to_date=${toDate}`);
    gapsExist = (data?.data || data || []).length > 0;
  }

  async function runExport(path, filename) {
    const err = await downloadReport(path, filename);
    if (err) error = `Export failed: ${err.message}`;
  }

  function exportInventory() {
    if (gapsExist) { error = 'Cannot export: unresolved inventory gaps exist. Resolve them first.'; return; }
    const qs = `from_date=${fromDate}&to_date=${toDate}&format=csv`;
    runExport(`/reports/inventory/export?${qs}`, `inventory-${fromDate}-to-${toDate}.csv`);
  }
  function exportEvents() {
    const qs = `from_date=${fromDate}&to_date=${toDate}&format=csv`;
    runExport(`/reports/events/export?${qs}`, `events-${fromDate}-to-${toDate}.csv`);
  }
  function exportApprovals() {
    const qs = `from_date=${fromDate}&to_date=${toDate}&format=csv`;
    runExport(`/reports/approvals/export?${qs}`, `approvals-${fromDate}-to-${toDate}.csv`);
  }
</script>

<div class="p-6 max-w-5xl mx-auto">
  <h1 class="text-2xl font-bold text-gray-900 mb-6">Reports</h1>

  {#if error}<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}<button onclick={() => error = ''} class="float-right font-bold">×</button></div>{/if}

  <div class="bg-white rounded-xl shadow p-4 mb-6 flex gap-4 items-end">
    <div><label class="block text-xs font-medium text-gray-500 mb-1">From</label><input type="date" bind:value={fromDate} class="px-3 py-2 border border-gray-300 rounded-lg text-sm" /></div>
    <div><label class="block text-xs font-medium text-gray-500 mb-1">To</label><input type="date" bind:value={toDate} class="px-3 py-2 border border-gray-300 rounded-lg text-sm" /></div>
    <button onclick={checkGaps} class="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm">Apply</button>
  </div>

  {#if gapsExist}
    <div class="bg-orange-50 border border-orange-200 text-orange-700 px-4 py-3 rounded-lg mb-6 text-sm">
      Unresolved inventory gaps detected in the selected date range. <a href="/inventory" class="font-medium underline">Resolve gaps</a> before exporting inventory reports.
    </div>
  {/if}

  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    {#if canExportInventory}
      <div class="bg-white rounded-xl shadow p-6">
        <h3 class="font-semibold text-gray-900 mb-2">Inventory Report</h3>
        <p class="text-sm text-gray-500 mb-4">Price and quantity trends for all items in the selected date range.</p>
        <button onclick={exportInventory} disabled={gapsExist}
          class="w-full py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium">
          Export CSV
        </button>
      </div>
    {/if}

    {#if canExportReports}
      <div class="bg-white rounded-xl shadow p-6">
        <h3 class="font-semibold text-gray-900 mb-2">Events Report</h3>
        <p class="text-sm text-gray-500 mb-4">Summary of all events including budget, headcount, and status.</p>
        <button onclick={exportEvents} class="w-full py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 font-medium">Export CSV</button>
      </div>

      <div class="bg-white rounded-xl shadow p-6">
        <h3 class="font-semibold text-gray-900 mb-2">Approvals Report</h3>
        <p class="text-sm text-gray-500 mb-4">Log of all approval decisions with timestamps and actors.</p>
        <button onclick={exportApprovals} class="w-full py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 font-medium">Export CSV</button>
      </div>
    {/if}
  </div>
</div>
