<script>
  import { get, post, upload as apiUpload } from '$lib/api/client.js';
  import { authStore } from '$lib/stores/auth.js';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Pagination from '$lib/components/ui/Pagination.svelte';

  let entitlements = $state([]);
  let pagination = $state({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  let loading = $state(true);
  let error = $state('');
  let activeTab = $state('my');
  let redeemId = $state(null);
  let redeemQty = $state(1);
  let actionLoading = $state('');
  let redeemResult = $state(null);
  let showManualForm = $state(false);
  let manualForm = $state({ event_id: '', user_id: '', entitlement_type_id: '', quantity_total: 1, expires_at: '' });
  let showBulkImport = $state(false);
  let bulkValidation = $state(null);

  const canIssue = $derived(authStore.hasPermission('entitlement:issue_manual'));
  const canBulk = $derived(authStore.hasPermission('entitlement:bulk_import'));
  const canRedeem = $derived(authStore.hasPermission('entitlement:redeem'));

  $effect(() => { loadEntitlements(); });

  async function loadEntitlements() {
    loading = true;
    const { data, error: err } = await get(`/entitlements?page=${pagination.page}&pageSize=${pagination.pageSize}`);
    if (err) error = err.message;
    else { entitlements = data?.data || []; pagination = data?.pagination || pagination; }
    loading = false;
  }

  async function redeem() {
    actionLoading = 'redeem';
    redeemResult = null;
    const { data, error: err } = await post(`/entitlements/${redeemId}/redeem`, { quantity: Number(redeemQty) });
    if (err) { error = err.message; }
    else { redeemResult = data; redeemId = null; await loadEntitlements(); }
    actionLoading = '';
  }

  async function issueManual() {
    actionLoading = 'issue';
    const { error: err } = await post('/entitlements/issue-manual', {
      ...manualForm,
      quantity_total: Number(manualForm.quantity_total),
      expires_at: manualForm.expires_at || undefined
    });
    if (err) error = err.message;
    else { showManualForm = false; await loadEntitlements(); }
    actionLoading = '';
  }

  async function handleBulkFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    const { data, error: err } = await apiUpload('/entitlements/bulk-import/validate', formData);
    if (err) error = err.message;
    else bulkValidation = data;
  }

  async function confirmBulk() {
    actionLoading = 'bulk';
    const { error: err } = await post('/entitlements/bulk-import/confirm', { batch_id: bulkValidation?.batch_id });
    if (err) error = err.message;
    else { showBulkImport = false; bulkValidation = null; await loadEntitlements(); }
    actionLoading = '';
  }
</script>

<div class="p-6 max-w-7xl mx-auto">
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-gray-900">Entitlements</h1>
    <div class="flex gap-2">
      {#if canIssue}<button onclick={() => showManualForm = !showManualForm} class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Issue Manual</button>{/if}
      {#if canBulk}<button onclick={() => showBulkImport = !showBulkImport} class="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700">Bulk Import</button>{/if}
    </div>
  </div>

  {#if error}<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}<button onclick={() => error = ''} class="float-right font-bold">×</button></div>{/if}
  {#if redeemResult}<div class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4 text-sm">Redeemed successfully. Remaining: {redeemResult.remaining}. Key: {redeemResult.idempotencyKey}</div>{/if}

  {#if showManualForm}
    <div class="bg-white rounded-xl shadow p-6 mb-6">
      <h3 class="font-semibold text-gray-900 mb-4">Issue Entitlement</h3>
      <div class="grid grid-cols-2 gap-4">
        <div><label class="block text-xs text-gray-500 mb-1">Event ID</label><input type="text" bind:value={manualForm.event_id} class="w-full px-3 py-2 border rounded-lg text-sm" /></div>
        <div><label class="block text-xs text-gray-500 mb-1">User ID</label><input type="text" bind:value={manualForm.user_id} class="w-full px-3 py-2 border rounded-lg text-sm" /></div>
        <div><label class="block text-xs text-gray-500 mb-1">Type ID</label><input type="text" bind:value={manualForm.entitlement_type_id} class="w-full px-3 py-2 border rounded-lg text-sm" /></div>
        <div><label class="block text-xs text-gray-500 mb-1">Quantity</label><input type="number" bind:value={manualForm.quantity_total} min="1" class="w-full px-3 py-2 border rounded-lg text-sm" /></div>
        <div><label class="block text-xs text-gray-500 mb-1">Expires</label><input type="date" bind:value={manualForm.expires_at} class="w-full px-3 py-2 border rounded-lg text-sm" /></div>
      </div>
      <button onclick={issueManual} disabled={actionLoading === 'issue'} class="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">{actionLoading === 'issue' ? 'Issuing...' : 'Issue'}</button>
    </div>
  {/if}

  {#if showBulkImport}
    <div class="bg-white rounded-xl shadow p-6 mb-6">
      <h3 class="font-semibold text-gray-900 mb-4">Bulk Import</h3>
      <input type="file" accept=".csv" onchange={handleBulkFile} class="text-sm" />
      {#if bulkValidation}
        <div class="mt-4 p-4 bg-gray-50 rounded-lg text-sm">
          <p>Valid: {bulkValidation.summary?.validCount || 0}, Errors: {bulkValidation.summary?.errorCount || 0}</p>
          {#if bulkValidation.errors?.length > 0}
            <div class="mt-2 text-red-600">{#each bulkValidation.errors.slice(0, 5) as e}<p>{e.row}: {e.message}</p>{/each}</div>
          {/if}
          <button onclick={confirmBulk} disabled={actionLoading === 'bulk'} class="mt-3 px-4 py-2 bg-green-600 text-white rounded-lg text-sm">{actionLoading === 'bulk' ? 'Importing...' : 'Confirm Import'}</button>
        </div>
      {/if}
    </div>
  {/if}

  {#if loading}
    <div class="bg-white rounded-xl shadow p-8 text-center"><div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div></div>
  {:else if entitlements.length === 0}
    <div class="bg-white rounded-xl shadow p-12 text-center text-gray-400">No entitlements found</div>
  {:else}
    <div class="bg-white rounded-xl shadow overflow-hidden">
      <table class="w-full text-sm">
        <thead><tr class="bg-gray-50 border-b text-left text-gray-500">
          <th class="px-4 py-3">Type</th><th class="px-4 py-3">Event</th><th class="px-4 py-3">Total</th><th class="px-4 py-3">Remaining</th><th class="px-4 py-3">Expires</th><th class="px-4 py-3">Mode</th><th class="px-4 py-3">Actions</th>
        </tr></thead>
        <tbody>
          {#each entitlements as ent}
            <tr class="border-b last:border-0 hover:bg-gray-50">
              <td class="px-4 py-3 font-medium">{ent.type_name || ent.entitlement_type_id?.slice(0,8)}</td>
              <td class="px-4 py-3 text-gray-500">{ent.event_id?.slice(0,8)}</td>
              <td class="px-4 py-3">{ent.quantity_total}</td>
              <td class="px-4 py-3 font-medium {Number(ent.quantity_remaining) <= 0 ? 'text-red-600' : 'text-green-600'}">{ent.quantity_remaining}</td>
              <td class="px-4 py-3 text-gray-400">{ent.expires_at ? new Date(ent.expires_at).toLocaleDateString() : '—'}</td>
              <td class="px-4 py-3"><Badge text={ent.issuance_mode} variant="info" /></td>
              <td class="px-4 py-3">
                {#if canRedeem && Number(ent.quantity_remaining) > 0}
                  {#if redeemId === ent.id}
                    <div class="flex gap-1">
                      <input type="number" bind:value={redeemQty} min="1" max={ent.quantity_remaining} class="w-16 px-2 py-1 border rounded text-xs" />
                      <button onclick={redeem} disabled={actionLoading === 'redeem'} class="px-2 py-1 bg-green-600 text-white rounded text-xs">Go</button>
                      <button onclick={() => redeemId = null} class="px-2 py-1 bg-gray-300 rounded text-xs">×</button>
                    </div>
                  {:else}
                    <button onclick={() => { redeemId = ent.id; redeemQty = 1; }} class="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700">Redeem</button>
                  {/if}
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      <div class="p-4 border-t"><Pagination page={pagination.page} pageSize={pagination.pageSize} total={pagination.total} onPageChange={(p) => { pagination.page = p; loadEntitlements(); }} /></div>
    </div>
  {/if}
</div>
