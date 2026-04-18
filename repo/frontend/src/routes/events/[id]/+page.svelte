<script>
  import { page } from '$app/stores';
  import { get, patch, post, del, upload as apiUpload } from '$lib/api/client.js';
  import { authStore } from '$lib/stores/auth.js';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Timeline from '$lib/components/ui/Timeline.svelte';

  let eventData = $state(null);
  let serviceWindows = $state([]);
  let materials = $state([]);
  let resourceRequests = $state([]);
  let attachments = $state([]);
  let auditEntries = $state([]);
  let loading = $state(true);
  let error = $state('');
  let actionLoading = $state('');
  let showUpload = $state(false);
  let uploadFiles = $state([]);
  let auditPage = $state(1);
  let auditHasMore = $state(false);

  const eventId = $derived($page.params.id);
  const user = $derived(authStore.get());
  const isCreator = $derived(eventData?.created_by === user?.userId);
  const canEdit = $derived(isCreator && ['draft', 'submitted'].includes(eventData?.state));
  const canApprove = $derived(authStore.hasPermission('event:approve'));
  const canService = $derived(authStore.hasPermission('event:service'));
  const canClose = $derived(authStore.hasPermission('event:close'));
  const canViewAudit = $derived(authStore.hasPermission('audit:read'));

  const allowedTransitions = $derived(() => {
    if (!eventData) return [];
    const t = [];
    if (eventData.state === 'draft' && (isCreator || authStore.hasPermission('event:submit'))) t.push({ state: 'submitted', label: 'Submit for Approval', color: 'bg-blue-600' });
    if (eventData.state === 'submitted' && canApprove) t.push({ state: 'approved', label: 'Approve', color: 'bg-green-600' });
    if (eventData.state === 'approved' && canService) t.push({ state: 'in_service', label: 'Start Service', color: 'bg-purple-600' });
    if (eventData.state === 'in_service' && canClose) t.push({ state: 'closed', label: 'Close Event', color: 'bg-gray-600' });
    return t;
  });

  $effect(() => { if (eventId) loadEvent(); });

  async function loadEvent() {
    loading = true;
    try {
      const { data: response, error: err } = await get(`/events/${eventId}`);
      if (err) { error = err.message; return; }
      const event = response.data;
      eventData = event;
      serviceWindows = event.service_windows || [];
      materials = event.materials || [];
      resourceRequests = event.resource_requests || [];

      const { data: attResponse } = await get(`/attachments?event_id=${eventId}`);
      attachments = attResponse?.data || [];

      if (canViewAudit) loadAudit();
    } catch (err) { error = 'Failed to load event'; }
    finally { loading = false; }
  }

  async function loadAudit() {
    const { data } = await get(`/events/${eventId}/audit-trail?page=${auditPage}&pageSize=20`);
    if (data) {
      const newEntries = (data.data || []).map(e => ({
        actor: e.actor_username || e.actor_user_id?.slice(0, 8),
        action: e.action,
        timestamp: e.created_at,
        before: e.before_json,
        after: e.after_json,
        notes: e.notes
      }));
      auditEntries = auditPage === 1 ? newEntries : [...auditEntries, ...newEntries];
      auditHasMore = data.pagination?.page < data.pagination?.totalPages;
    }
  }

  async function handleTransition(newState) {
    actionLoading = newState;
    const { error: err } = await patch(`/events/${eventId}/state`, { state: newState });
    if (err) error = err.message;
    else await loadEvent();
    actionLoading = '';
  }

  async function handleFileUpload(e) {
    const files = e.target.files;
    if (!files?.length) return;
    for (const file of files) {
      if (file.size > 25 * 1024 * 1024) { error = `File ${file.name} exceeds 25MB limit`; continue; }
      const formData = new FormData();
      formData.append('file', file);
      const { error: upErr } = await apiUpload(`/attachments?event_id=${eventId}`, formData);
      if (upErr) error = `Upload failed: ${upErr.message}`;
    }
    await loadEvent();
    showUpload = false;
  }
</script>

<div class="p-6 max-w-7xl mx-auto">
  {#if loading}
    <div class="flex items-center justify-center py-20">
      <div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else if error && !eventData}
    <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
  {:else if eventData}
    {#if error}
      <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">{error}
        <button onclick={() => error = ''} class="float-right font-bold">×</button>
      </div>
    {/if}

    <!-- Header -->
    <div class="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div>
        <a href="/events" class="text-blue-600 hover:underline text-sm">← Back to Events</a>
        <h1 class="text-2xl font-bold text-gray-900 mt-1">{eventData.title}</h1>
        <div class="flex items-center gap-3 mt-2">
          <Badge text={eventData.state} variant={eventData.state} />
          <span class="text-gray-500">{eventData.event_date}</span>
          <span class="text-gray-500">·</span>
          <span class="text-gray-500">{eventData.headcount} guests</span>
        </div>
      </div>
      <div class="flex gap-2">
        {#each allowedTransitions() as t}
          <button onclick={() => handleTransition(t.state)} disabled={!!actionLoading}
            class="{t.color} text-white px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 font-medium text-sm flex items-center gap-2">
            {#if actionLoading === t.state}<span class="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>{/if}
            {t.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Main Content -->
      <div class="lg:col-span-2 space-y-6">
        <!-- Description -->
        {#if eventData.description}
          <div class="bg-white rounded-xl shadow p-6">
            <h3 class="font-semibold text-gray-900 mb-2">Description</h3>
            <p class="text-gray-600">{eventData.description}</p>
          </div>
        {/if}

        <!-- Budget -->
        <div class="bg-white rounded-xl shadow p-6">
          <h3 class="font-semibold text-gray-900 mb-3">Budget</h3>
          <div class="grid grid-cols-2 gap-4">
            <div><p class="text-sm text-gray-500">Amount</p><p class="text-xl font-bold">${Number(eventData.budget_amount).toLocaleString()}</p></div>
            <div><p class="text-sm text-gray-500">Cap</p><p class="text-xl font-bold">${Number(eventData.budget_cap).toLocaleString()}</p></div>
          </div>
          {#if Number(eventData.budget_amount) > Number(eventData.budget_cap)}
            <div class="mt-3 bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">Budget exceeds cap — override approval required</div>
          {/if}
        </div>

        <!-- Service Windows -->
        <div class="bg-white rounded-xl shadow p-6">
          <h3 class="font-semibold text-gray-900 mb-3">Service Windows</h3>
          {#if serviceWindows.length === 0}
            <p class="text-gray-400">No service windows defined</p>
          {:else}
            <div class="space-y-2">
              {#each serviceWindows as sw}
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <span class="font-medium">{sw.label}</span>
                    <span class="text-gray-500 text-sm ml-2">{new Date(sw.start_at).toLocaleString()} — {new Date(sw.end_at).toLocaleString()}</span>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Materials -->
        <div class="bg-white rounded-xl shadow p-6">
          <h3 class="font-semibold text-gray-900 mb-3">Materials List</h3>
          {#if materials.length === 0}
            <p class="text-gray-400">No materials added</p>
          {:else}
            <table class="w-full text-sm">
              <thead><tr class="border-b text-left text-gray-500"><th class="pb-2">Type</th><th class="pb-2">Name</th><th class="pb-2">Qty</th><th class="pb-2">Unit</th></tr></thead>
              <tbody>
                {#each materials as m}
                  <tr class="border-b last:border-0"><td class="py-2"><Badge text={m.material_type} variant="info" /></td><td class="py-2">{m.recipe_title || m.resource_name || '—'}</td><td class="py-2">{m.display_quantity}</td><td class="py-2">{m.unit || '—'}</td></tr>
                {/each}
              </tbody>
            </table>
          {/if}
        </div>

        <!-- Attachments -->
        <div class="bg-white rounded-xl shadow p-6">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-gray-900">Attachments</h3>
            {#if canEdit || authStore.hasPermission('attachment:upload')}
              <label class="text-sm text-blue-600 hover:underline cursor-pointer">
                + Upload
                <input type="file" multiple class="hidden" onchange={handleFileUpload} accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.gif,.webp" />
              </label>
            {/if}
          </div>
          {#if attachments.length === 0}
            <p class="text-gray-400">No attachments</p>
          {:else}
            <div class="space-y-2">
              {#each attachments as att}
                <div class="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                  <div class="flex items-center gap-2">
                    <span class="text-lg">{att.mime_type?.startsWith('image/') ? '🖼' : '📄'}</span>
                    <span class="text-sm">{att.original_name}</span>
                    <span class="text-xs text-gray-400">{(att.size_bytes / 1024).toFixed(0)} KB</span>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <!-- Sidebar -->
      <div class="space-y-6">
        <!-- Resource Requests -->
        <div class="bg-white rounded-xl shadow p-6">
          <h3 class="font-semibold text-gray-900 mb-3">Resource Requests</h3>
          {#if resourceRequests.length === 0}
            <p class="text-gray-400 text-sm">No resource requests</p>
          {:else}
            <div class="space-y-2">
              {#each resourceRequests as rr}
                <div class="p-2 bg-gray-50 rounded-lg text-sm">
                  <p class="font-medium">{rr.resource_name || rr.resource_id?.slice(0,8)}</p>
                  <p class="text-gray-500">Qty: {rr.quantity} · <Badge text={rr.status} variant={rr.status} /></p>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Audit Timeline -->
        {#if canViewAudit}
          <div class="bg-white rounded-xl shadow p-6">
            <h3 class="font-semibold text-gray-900 mb-3">Activity Timeline</h3>
            {#if auditEntries.length === 0}
              <p class="text-gray-400 text-sm">No activity yet</p>
            {:else}
              <Timeline entries={auditEntries} />
              {#if auditHasMore}
                <button onclick={() => { auditPage++; loadAudit(); }} class="mt-3 text-sm text-blue-600 hover:underline w-full text-center">Load More</button>
              {/if}
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
