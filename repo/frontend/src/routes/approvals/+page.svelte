<script>
  import { get, post } from '$lib/api/client.js';
  import { authStore } from '$lib/stores/auth.js';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Pagination from '$lib/components/ui/Pagination.svelte';

  let approvals = $state([]);
  let pagination = $state({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  let loading = $state(true);
  let error = $state('');
  let typeFilter = $state('');
  let actionLoading = $state('');
  let justification = $state('');
  let selectedId = $state(null);
  let showModal = $state(false);
  let modalAction = $state('');

  $effect(() => { loadApprovals(); });

  async function loadApprovals() {
    loading = true;
    const params = new URLSearchParams();
    params.set('page', String(pagination.page));
    params.set('pageSize', String(pagination.pageSize));
    if (typeFilter) params.set('type', typeFilter);
    const { data, error: err } = await get(`/approvals/pending?${params}`);
    if (err) error = err.message;
    else { approvals = data?.data || []; pagination = data?.pagination || pagination; }
    loading = false;
  }

  function openAction(id, action) {
    selectedId = id;
    modalAction = action;
    justification = '';
    showModal = true;
  }

  async function submitAction() {
    actionLoading = selectedId;
    const endpoint = modalAction === 'approve' ? `/approvals/${selectedId}/approve` : `/approvals/${selectedId}/reject`;
    const { error: err } = await post(endpoint, { justification });
    if (err) error = err.message;
    else { showModal = false; await loadApprovals(); }
    actionLoading = '';
  }

  function handlePageChange(p) { pagination.page = p; loadApprovals(); }
  function handleFilter() { pagination.page = 1; loadApprovals(); }
</script>

<div class="p-6 max-w-7xl mx-auto">
  <h1 class="text-2xl font-bold text-gray-900 mb-6">Pending Approvals</h1>

  <div class="bg-white rounded-xl shadow p-4 mb-6 flex gap-4 items-end">
    <div>
      <label class="block text-xs font-medium text-gray-500 mb-1">Type</label>
      <select bind:value={typeFilter} onchange={handleFilter} class="px-3 py-2 border border-gray-300 rounded-lg text-sm">
        <option value="">All Types</option>
        <option value="budget_override">Budget Override</option>
        <option value="budget_change">Budget Change</option>
        <option value="special_resource">Special Resource</option>
        <option value="quota_override">Quota Override</option>
        <option value="overtime">Overtime</option>
      </select>
    </div>
  </div>

  {#if loading}
    <div class="bg-white rounded-xl shadow p-8 text-center">
      <div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
    </div>
  {:else if approvals.length === 0}
    <div class="bg-white rounded-xl shadow p-12 text-center">
      <p class="text-gray-400 text-lg">No pending approvals</p>
    </div>
  {:else}
    <div class="bg-white rounded-xl shadow overflow-hidden">
      <table class="w-full text-sm">
        <thead><tr class="bg-gray-50 border-b text-left text-gray-500">
          <th class="px-4 py-3">Type</th><th class="px-4 py-3">Event</th><th class="px-4 py-3">Amount</th><th class="px-4 py-3">Requested By</th><th class="px-4 py-3">Date</th><th class="px-4 py-3">Actions</th>
        </tr></thead>
        <tbody>
          {#each approvals as a}
            <tr class="border-b last:border-0 hover:bg-gray-50">
              <td class="px-4 py-3"><Badge text={a.approval_type?.replace(/_/g, ' ')} variant="pending" /></td>
              <td class="px-4 py-3"><a href="/events/{a.event_id}" class="text-blue-600 hover:underline">{a.event_title || a.event_id?.slice(0,8)}</a></td>
              <td class="px-4 py-3">{a.new_amount ? `$${Number(a.new_amount).toLocaleString()}` : '—'}</td>
              <td class="px-4 py-3">{a.requested_by_username || a.requested_by?.slice(0,8)}</td>
              <td class="px-4 py-3 text-gray-400">{new Date(a.created_at).toLocaleDateString()}</td>
              <td class="px-4 py-3">
                <div class="flex gap-2">
                  <button onclick={() => openAction(a.id, 'approve')} class="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700">Approve</button>
                  <button onclick={() => openAction(a.id, 'reject')} class="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700">Reject</button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      <div class="p-4 border-t"><Pagination page={pagination.page} pageSize={pagination.pageSize} total={pagination.total} onPageChange={handlePageChange} /></div>
    </div>
  {/if}
</div>

<!-- Approval Modal -->
{#if showModal}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
      <h3 class="text-lg font-bold mb-4 capitalize">{modalAction} Approval</h3>
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-1">Justification</label>
        <textarea bind:value={justification} rows="3" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Enter justification..."></textarea>
      </div>
      {#if error}<div class="text-red-600 text-sm mb-3">{error}</div>{/if}
      <div class="flex justify-end gap-2">
        <button onclick={() => showModal = false} class="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
        <button onclick={submitAction} disabled={!!actionLoading}
          class="px-4 py-2 {modalAction === 'approve' ? 'bg-green-600' : 'bg-red-600'} text-white rounded-lg text-sm disabled:opacity-50">
          {actionLoading ? 'Processing...' : modalAction === 'approve' ? 'Approve' : 'Reject'}
        </button>
      </div>
    </div>
  </div>
{/if}
