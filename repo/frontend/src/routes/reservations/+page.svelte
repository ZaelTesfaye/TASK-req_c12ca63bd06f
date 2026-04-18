<script>
  import { get, post } from '$lib/api/client.js';
  import { authStore } from '$lib/stores/auth.js';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Pagination from '$lib/components/ui/Pagination.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';

  let reservations = $state([]);
  let pagination = $state({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  let loading = $state(true);
  let error = $state('');
  let statusFilter = $state('');
  let actionLoading = $state('');
  let showModal = $state(false);
  let modalAction = $state('');
  let selectedId = $state(null);
  let occupancyCount = $state(1);
  let actualEndAt = $state('');
  let overtimeJustification = $state('');
  let newStart = $state('');
  let newEnd = $state('');

  const canApprove = $derived(authStore.hasPermission('reservation:approve'));
  const canOperate = $derived(authStore.hasPermission('reservation:operate'));
  const canOvertimeApprove = $derived(authStore.hasPermission('reservation:overtime_approve'));

  $effect(() => { loadReservations(); });

  async function loadReservations() {
    loading = true;
    const params = new URLSearchParams({ page: pagination.page, pageSize: pagination.pageSize });
    if (statusFilter) params.set('status', statusFilter);
    const { data, error: err } = await get(`/reservations?${params}`);
    if (err) error = err.message;
    else { reservations = data?.data || []; pagination = data?.pagination || pagination; }
    loading = false;
  }

  function openAction(id, action) {
    selectedId = id;
    modalAction = action;
    showModal = true;
    occupancyCount = 1;
    actualEndAt = '';
    overtimeJustification = '';
    newStart = '';
    newEnd = '';
  }

  function closeModal() {
    showModal = false;
    overtimeJustification = '';
    actualEndAt = '';
    newStart = '';
    newEnd = '';
  }

  /**
   * True when the string parses to a real calendar date. Used as a gate on
   * every toISOString() call below so we never throw on an empty or
   * malformed <input type="datetime-local"> value.
   */
  function isValidDateInput(str) {
    if (!str) return false;
    const t = new Date(str).getTime();
    return Number.isFinite(t);
  }

  function toIso(str) {
    return new Date(str).toISOString();
  }

  // Reactive submit-enable guard: the "Confirm" button stays disabled
  // until the required fields for the current modalAction are present
  // and valid. This prevents a user from firing a request with blank or
  // malformed datetime fields (which previously threw before dispatch).
  const canSubmit = $derived.by(() => {
    if (actionLoading) return false;
    switch (modalAction) {
      case 'occupy':
        return Number(occupancyCount) > 0;
      case 'return':
        return isValidDateInput(actualEndAt);
      case 'reschedule':
        return isValidDateInput(newStart) && isValidDateInput(newEnd);
      case 'renew':
        return isValidDateInput(newEnd);
      case 'approve-overtime':
        return overtimeJustification.trim().length > 0;
      // approve / cancel / release have no extra required fields.
      default:
        return true;
    }
  });

  async function submitAction() {
    // Client-side validation guard. Anything that requires a datetime or
    // justification is already gated by canSubmit, but we repeat the
    // checks here so a programmatic call can't bypass them.
    if (modalAction === 'return' && !isValidDateInput(actualEndAt)) {
      error = 'Please enter a valid actual end time before submitting.';
      return;
    }
    if (modalAction === 'reschedule' && (!isValidDateInput(newStart) || !isValidDateInput(newEnd))) {
      error = 'Please enter valid start and end times before submitting.';
      return;
    }
    if (modalAction === 'renew' && !isValidDateInput(newEnd)) {
      error = 'Please enter a valid new end time before submitting.';
      return;
    }
    if (modalAction === 'approve-overtime' && overtimeJustification.trim().length === 0) {
      error = 'Justification is required to approve overtime.';
      return;
    }

    actionLoading = modalAction;
    let endpoint = `/reservations/${selectedId}/${modalAction}`;
    let body = {};
    if (modalAction === 'occupy') body = { occupancy_count: Number(occupancyCount) };
    if (modalAction === 'return') body = {
      actual_end_at: toIso(actualEndAt),
      overtime_justification: overtimeJustification || undefined,
    };
    if (modalAction === 'reschedule') body = {
      scheduled_start_at: toIso(newStart),
      scheduled_end_at: toIso(newEnd),
    };
    if (modalAction === 'renew') body = { new_end_at: toIso(newEnd) };
    if (modalAction === 'approve-overtime') body = { justification: overtimeJustification.trim() };
    const { error: err } = await post(endpoint, body);
    if (err) error = err.message;
    else { closeModal(); await loadReservations(); }
    actionLoading = '';
  }

  function handlePageChange(p) { pagination.page = p; loadReservations(); }
</script>

<div class="p-6 max-w-7xl mx-auto">
  <h1 class="text-2xl font-bold text-gray-900 mb-6">Reservations</h1>

  <div class="bg-white rounded-xl shadow p-4 mb-6 flex gap-4">
    <div>
      <label class="block text-xs font-medium text-gray-500 mb-1">Status</label>
      <select bind:value={statusFilter} onchange={() => { pagination.page = 1; loadReservations(); }} class="px-3 py-2 border border-gray-300 rounded-lg text-sm">
        <option value="">All</option>
        <option value="requested">Requested</option>
        <option value="approved">Approved</option>
        <option value="released">Released</option>
        <option value="occupied">Occupied</option>
        <option value="returned">Returned</option>
        <option value="cancelled">Cancelled</option>
      </select>
    </div>
  </div>

  {#if error}<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}<button onclick={() => error = ''} class="float-right font-bold">×</button></div>{/if}

  {#if loading}
    <div class="bg-white rounded-xl shadow p-8 text-center"><div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div></div>
  {:else if reservations.length === 0}
    <div class="bg-white rounded-xl shadow p-12 text-center text-gray-400">No reservations found</div>
  {:else}
    <div class="bg-white rounded-xl shadow overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead><tr class="bg-gray-50 border-b text-left text-gray-500">
            <th class="px-4 py-3">Resource</th><th class="px-4 py-3">Event</th><th class="px-4 py-3">Status</th>
            <th class="px-4 py-3">Scheduled</th><th class="px-4 py-3">Overtime</th><th class="px-4 py-3">Actions</th>
          </tr></thead>
          <tbody>
            {#each reservations as r}
              <tr class="border-b last:border-0 hover:bg-gray-50">
                <td class="px-4 py-3 font-medium">{r.resource_name || r.resource_id?.slice(0,8)}</td>
                <td class="px-4 py-3"><a href="/events/{r.event_id}" class="text-blue-600 hover:underline">{r.event_title || r.event_id?.slice(0,8)}</a></td>
                <td class="px-4 py-3"><Badge text={r.status} variant={r.status} /></td>
                <td class="px-4 py-3 text-gray-500 text-xs">
                  {new Date(r.scheduled_start_at).toLocaleString()}<br/>— {new Date(r.scheduled_end_at).toLocaleString()}
                </td>
                <td class="px-4 py-3">
                  {#if r.overtime_minutes > 0}
                    <span class="text-red-600 font-medium">{r.overtime_minutes} min</span>
                    {#if r.overtime_pending_approval}<Badge text="Pending" variant="warning" />{/if}
                  {:else}
                    <span class="text-gray-400">—</span>
                  {/if}
                </td>
                <td class="px-4 py-3">
                  <div class="flex gap-1 flex-wrap">
                    {#if r.status === 'requested' && canApprove}
                      <button onclick={() => openAction(r.id, 'approve')} class="px-2 py-1 bg-green-600 text-white rounded text-xs">Approve</button>
                      <button onclick={() => openAction(r.id, 'cancel')} class="px-2 py-1 bg-red-600 text-white rounded text-xs">Cancel</button>
                    {/if}
                    {#if r.status === 'approved' && canOperate}
                      <button onclick={() => openAction(r.id, 'release')} class="px-2 py-1 bg-blue-600 text-white rounded text-xs">Release</button>
                    {/if}
                    {#if r.status === 'released' && canOperate}
                      <button onclick={() => openAction(r.id, 'occupy')} class="px-2 py-1 bg-purple-600 text-white rounded text-xs">Occupy</button>
                    {/if}
                    {#if r.status === 'occupied' && canOperate}
                      <button onclick={() => openAction(r.id, 'return')} class="px-2 py-1 bg-gray-600 text-white rounded text-xs">Return</button>
                    {/if}
                    {#if r.overtime_pending_approval && canOvertimeApprove}
                      <button onclick={() => openAction(r.id, 'approve-overtime')} class="px-2 py-1 bg-orange-600 text-white rounded text-xs">Approve OT</button>
                    {/if}
                    {#if ['approved', 'released'].includes(r.status) && canOperate}
                      <button onclick={() => openAction(r.id, 'reschedule')} class="px-2 py-1 bg-yellow-600 text-white rounded text-xs">Reschedule</button>
                      <button onclick={() => openAction(r.id, 'renew')} class="px-2 py-1 bg-teal-600 text-white rounded text-xs">Renew</button>
                    {/if}
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="p-4 border-t"><Pagination page={pagination.page} pageSize={pagination.pageSize} total={pagination.total} onPageChange={handlePageChange} /></div>
    </div>
  {/if}
</div>

<!-- Action Modal -->
{#if showModal}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
      <h3 class="text-lg font-bold mb-4 capitalize">{modalAction.replace('-', ' ')} Reservation</h3>

      {#if modalAction === 'occupy'}
        <div class="mb-4"><label class="block text-sm font-medium text-gray-700 mb-1">Occupancy Count</label>
          <input type="number" bind:value={occupancyCount} min="1" class="w-full px-3 py-2 border rounded-lg text-sm" />
        </div>
      {/if}
      {#if modalAction === 'return'}
        <div class="mb-4"><label class="block text-sm font-medium text-gray-700 mb-1">Actual End Time</label>
          <input type="datetime-local" bind:value={actualEndAt} class="w-full px-3 py-2 border rounded-lg text-sm" />
        </div>
        <div class="mb-4"><label class="block text-sm font-medium text-gray-700 mb-1">Overtime Justification (if &gt;30min)</label>
          <textarea bind:value={overtimeJustification} rows="2" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Required if overtime exceeds 30 minutes"></textarea>
        </div>
      {/if}
      {#if modalAction === 'reschedule'}
        <div class="mb-4"><label class="block text-sm font-medium text-gray-700 mb-1">New Start</label>
          <input type="datetime-local" bind:value={newStart} class="w-full px-3 py-2 border rounded-lg text-sm" /></div>
        <div class="mb-4"><label class="block text-sm font-medium text-gray-700 mb-1">New End</label>
          <input type="datetime-local" bind:value={newEnd} class="w-full px-3 py-2 border rounded-lg text-sm" /></div>
      {/if}
      {#if modalAction === 'renew'}
        <div class="mb-4"><label class="block text-sm font-medium text-gray-700 mb-1">New End Time</label>
          <input type="datetime-local" bind:value={newEnd} class="w-full px-3 py-2 border rounded-lg text-sm" /></div>
      {/if}
      {#if modalAction === 'approve-overtime'}
        <div class="mb-4">
          <label for="overtime-justification" class="block text-sm font-medium text-gray-700 mb-1">
            Justification <span class="text-red-600">*</span>
          </label>
          <textarea
            id="overtime-justification"
            bind:value={overtimeJustification}
            rows="3"
            required
            class="w-full px-3 py-2 border rounded-lg text-sm"
            placeholder="Explain why this overtime should be approved"
          ></textarea>
        </div>
      {/if}

      <div class="flex justify-end gap-2">
        <button onclick={closeModal} class="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
        <button onclick={submitAction} disabled={!canSubmit} class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed">
          {actionLoading ? 'Processing...' : 'Confirm'}
        </button>
      </div>
    </div>
  </div>
{/if}
