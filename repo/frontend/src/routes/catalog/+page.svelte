<script>
  import { get, post, patch } from '$lib/api/client.js';
  import { authStore } from '$lib/stores/auth.js';
  import Badge from '$lib/components/ui/Badge.svelte';

  let tree = $state([]);
  let loading = $state(true);
  let error = $state('');
  let selectedResource = $state(null);
  let expandedNodes = $state(new Set());
  let showCreateForm = $state(false);
  let createForm = $state({ name: '', resource_type: 'venue', parent_id: '', requires_approval: false, quota_per_event: null });
  let actionLoading = $state('');

  const canManage = $derived(authStore.hasPermission('resource:manage'));

  $effect(() => { loadTree(); });

  async function loadTree() {
    loading = true;
    const { data, error: err } = await get('/catalog/tree');
    if (err) error = err.message;
    else tree = data || [];
    loading = false;
  }

  function toggleNode(id) {
    const next = new Set(expandedNodes);
    if (next.has(id)) next.delete(id); else next.add(id);
    expandedNodes = next;
  }

  async function selectResource(id) {
    const { data } = await get(`/catalog/resources/${id}`);
    selectedResource = data;
  }

  async function publishResource(id) {
    actionLoading = 'publish';
    const { error: err } = await post(`/catalog/resources/${id}/publish`);
    if (err) error = err.message;
    else await loadTree();
    actionLoading = '';
  }

  async function createResource() {
    actionLoading = 'create';
    const body = { ...createForm, parent_id: createForm.parent_id || undefined, quota_per_event: createForm.quota_per_event || undefined };
    const { error: err } = await post('/catalog/resources', body);
    if (err) error = err.message;
    else { showCreateForm = false; await loadTree(); }
    actionLoading = '';
  }
</script>

<div class="p-6 max-w-7xl mx-auto">
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-gray-900">Resource Catalog</h1>
    {#if canManage}
      <button onclick={() => showCreateForm = !showCreateForm} class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">+ Add Resource</button>
    {/if}
  </div>

  {#if error}<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>{/if}

  {#if showCreateForm}
    <div class="bg-white rounded-xl shadow p-6 mb-6">
      <h3 class="font-semibold text-gray-900 mb-4">New Resource</h3>
      <div class="grid grid-cols-2 gap-4">
        <div><label class="block text-xs text-gray-500 mb-1">Name</label><input type="text" bind:value={createForm.name} class="w-full px-3 py-2 border rounded-lg text-sm" /></div>
        <div><label class="block text-xs text-gray-500 mb-1">Type</label>
          <select bind:value={createForm.resource_type} class="w-full px-3 py-2 border rounded-lg text-sm">
            <option value="venue">Venue</option><option value="catering">Catering</option><option value="equipment">Equipment</option>
          </select>
        </div>
        <div><label class="block text-xs text-gray-500 mb-1">Parent ID</label><input type="text" bind:value={createForm.parent_id} class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Optional" /></div>
        <div><label class="block text-xs text-gray-500 mb-1">Quota per Event</label><input type="number" bind:value={createForm.quota_per_event} class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Optional" /></div>
        <div class="flex items-center gap-2"><input type="checkbox" bind:checked={createForm.requires_approval} /><label class="text-sm text-gray-700">Requires Approval</label></div>
      </div>
      <button onclick={createResource} disabled={actionLoading === 'create'} class="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">{actionLoading === 'create' ? 'Creating...' : 'Create'}</button>
    </div>
  {/if}

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- Tree View -->
    <div class="lg:col-span-2 bg-white rounded-xl shadow p-6">
      <h3 class="font-semibold text-gray-900 mb-4">Catalog Tree</h3>
      {#if loading}
        <div class="flex justify-center py-8"><div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>
      {:else if tree.length === 0}
        <p class="text-gray-400 text-center py-8">No resources in catalog</p>
      {:else}
        {#snippet renderNode(node, depth)}
          <div style="padding-left: {depth * 20}px">
            <div class="flex items-center gap-2 py-2 px-2 hover:bg-gray-50 rounded cursor-pointer" onclick={() => { toggleNode(node.id); selectResource(node.id); }}>
              {#if node.children?.length > 0}
                <span class="text-gray-400 text-xs">{expandedNodes.has(node.id) ? '▼' : '▶'}</span>
              {:else}
                <span class="text-gray-300 text-xs">•</span>
              {/if}
              <span class="font-medium text-sm">{node.name}</span>
              <Badge text={node.resource_type} variant="info" />
              {#if node.requires_approval}<Badge text="Approval Req." variant="warning" />{/if}
              {#if node.status !== 'published'}<Badge text={node.status} variant="draft" />{/if}
            </div>
            {#if expandedNodes.has(node.id) && node.children?.length > 0}
              {#each node.children as child}
                {@render renderNode(child, depth + 1)}
              {/each}
            {/if}
          </div>
        {/snippet}
        {#each tree as node}
          {@render renderNode(node, 0)}
        {/each}
      {/if}
    </div>

    <!-- Resource Detail -->
    <div class="bg-white rounded-xl shadow p-6">
      <h3 class="font-semibold text-gray-900 mb-4">Details</h3>
      {#if selectedResource}
        <div class="space-y-3 text-sm">
          <div><span class="text-gray-500">Name:</span> <span class="font-medium">{selectedResource.name}</span></div>
          <div><span class="text-gray-500">Type:</span> <Badge text={selectedResource.resource_type} variant="info" /></div>
          <div><span class="text-gray-500">Status:</span> <Badge text={selectedResource.status} variant={selectedResource.status} /></div>
          <div><span class="text-gray-500">Version:</span> {selectedResource.version}</div>
          {#if selectedResource.requires_approval}<div class="text-orange-600">Requires approval for requests</div>{/if}
          {#if selectedResource.quota_per_event}<div><span class="text-gray-500">Quota/event:</span> {selectedResource.quota_per_event}</div>{/if}
          {#if selectedResource.tags?.length > 0}
            <div class="flex gap-1 flex-wrap">{#each selectedResource.tags as t}<span class="text-xs bg-gray-100 px-2 py-0.5 rounded-full">{t.tag || t}</span>{/each}</div>
          {/if}
          {#if canManage && selectedResource.status !== 'published'}
            <button onclick={() => publishResource(selectedResource.id)} class="mt-2 px-3 py-1.5 bg-green-600 text-white rounded text-sm">Publish</button>
          {/if}
        </div>
      {:else}
        <p class="text-gray-400">Select a resource to view details</p>
      {/if}
    </div>
  </div>
</div>
