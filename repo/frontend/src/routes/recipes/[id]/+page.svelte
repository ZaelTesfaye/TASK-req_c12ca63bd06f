<script>
  import { page } from '$app/stores';
  import { get, post, unwrap } from '$lib/api/client.js';
  import { authStore } from '$lib/stores/auth.js';
  import Badge from '$lib/components/ui/Badge.svelte';

  let recipe = $state(null);
  let versions = $state([]);
  let loading = $state(true);
  let error = $state('');
  let actionLoading = $state('');
  let showRevision = $state(false);
  let revisionForm = $state({ title: '', steps_json: '[]', quantities_json: '[]', difficulty: 'medium', time_estimate_minutes: 30, tags_json: '[]', rich_text_html: '' });

  const recipeId = $derived($page.params.id);
  const canReview = $derived(authStore.hasPermission('recipe:review'));
  const canApprove = $derived(authStore.hasPermission('recipe:approve'));
  const canCreate = $derived(authStore.hasPermission('recipe:create'));
  const currentVersion = $derived(versions.find(v => v.id === recipe?.current_version_id) || versions[0]);

  $effect(() => { if (recipeId) loadRecipe(); });

  async function loadRecipe() {
    loading = true;
    const { data: response, error: err } = await get(`/recipes/${recipeId}`);
    if (err) { error = err.message; loading = false; return; }
    const payload = unwrap(response);
    recipe = payload;
    versions = payload?.versions || [];
    loading = false;
  }

  async function submitForReview() {
    actionLoading = 'submit';
    const { error: err } = await post(`/recipes/${recipeId}/submit-review`);
    if (err) error = err.message;
    else await loadRecipe();
    actionLoading = '';
  }

  async function approveRecipe() {
    actionLoading = 'approve';
    const { error: err } = await post(`/recipes/${recipeId}/approve`);
    if (err) error = err.message;
    else await loadRecipe();
    actionLoading = '';
  }

  async function rejectRecipe() {
    actionLoading = 'reject';
    const { error: err } = await post(`/recipes/${recipeId}/reject`, { notes: 'Rejected by reviewer' });
    if (err) error = err.message;
    else await loadRecipe();
    actionLoading = '';
  }

  async function createRevision() {
    actionLoading = 'revision';
    const body = {
      ...revisionForm,
      steps_json: JSON.parse(revisionForm.steps_json || '[]'),
      quantities_json: JSON.parse(revisionForm.quantities_json || '[]'),
      tags_json: JSON.parse(revisionForm.tags_json || '[]'),
      time_estimate_minutes: Number(revisionForm.time_estimate_minutes)
    };
    const { error: err } = await post(`/recipes/${recipeId}/revisions`, body);
    if (err) error = err.message;
    else { showRevision = false; await loadRecipe(); }
    actionLoading = '';
  }
</script>

<div class="p-6 max-w-7xl mx-auto">
  {#if loading}
    <div class="flex justify-center py-20"><div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>
  {:else if recipe}
    <a href="/recipes" class="text-blue-600 hover:underline text-sm">← Back to Recipes</a>
    {#if error}<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mt-3 text-sm">{error}</div>{/if}

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
      <div class="lg:col-span-2 space-y-6">
        <!-- Current Version -->
        {#if currentVersion}
          <div class="bg-white rounded-xl shadow p-6">
            <div class="flex items-center justify-between mb-4">
              <h1 class="text-2xl font-bold text-gray-900">{currentVersion.title}</h1>
              <Badge text={currentVersion.status} variant={currentVersion.status === 'approved' ? 'approved' : currentVersion.status === 'rejected' ? 'rejected' : 'pending'} />
            </div>
            <div class="flex gap-4 text-sm text-gray-500 mb-6">
              <span>Version {currentVersion.version_no}</span>
              <span>Difficulty: {currentVersion.difficulty || '—'}</span>
              <span>Time: {currentVersion.time_estimate_minutes || '—'} min</span>
            </div>

            {#if currentVersion.tags_json?.length > 0}
              <div class="flex gap-2 mb-4">
                {#each (Array.isArray(currentVersion.tags_json) ? currentVersion.tags_json : []) as tag}
                  <span class="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{tag}</span>
                {/each}
              </div>
            {/if}

            <div class="space-y-4">
              <div>
                <h3 class="font-semibold text-gray-900 mb-2">Steps</h3>
                <div class="text-sm text-gray-600">
                  {#each (Array.isArray(currentVersion.steps_json) ? currentVersion.steps_json : []) as step, i}
                    <p class="mb-1">{i + 1}. {typeof step === 'string' ? step : step.description || JSON.stringify(step)}</p>
                  {/each}
                  {#if !currentVersion.steps_json?.length}<p class="text-gray-400">No steps defined</p>{/if}
                </div>
              </div>
              {#if currentVersion.rich_text_html}
                <div>
                  <h3 class="font-semibold text-gray-900 mb-2">Notes</h3>
                  <div class="prose prose-sm max-w-none">{@html currentVersion.rich_text_html}</div>
                </div>
              {/if}
            </div>

            <!-- Actions -->
            <div class="flex gap-2 mt-6 pt-4 border-t">
              {#if currentVersion.status === 'draft' && canReview}
                <button onclick={submitForReview} disabled={!!actionLoading} class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                  {actionLoading === 'submit' ? 'Submitting...' : 'Submit for Review'}
                </button>
              {/if}
              {#if currentVersion.status === 'submitted_for_review' && canApprove}
                <button onclick={approveRecipe} disabled={!!actionLoading} class="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                  {actionLoading === 'approve' ? 'Approving...' : 'Approve'}
                </button>
                <button onclick={rejectRecipe} disabled={!!actionLoading} class="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
                  {actionLoading === 'reject' ? 'Rejecting...' : 'Reject'}
                </button>
              {/if}
              {#if canCreate}
                <button onclick={() => showRevision = !showRevision} class="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">New Revision</button>
              {/if}
            </div>
          </div>
        {/if}

        {#if showRevision}
          <div class="bg-white rounded-xl shadow p-6">
            <h3 class="font-semibold text-gray-900 mb-4">New Revision</h3>
            <div class="space-y-3">
              <div><label class="block text-sm font-medium text-gray-700 mb-1">Title</label><input type="text" bind:value={revisionForm.title} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" /></div>
              <div><label class="block text-sm font-medium text-gray-700 mb-1">Steps (JSON)</label><textarea bind:value={revisionForm.steps_json} rows="4" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"></textarea></div>
              <div><label class="block text-sm font-medium text-gray-700 mb-1">Quantities (JSON)</label><textarea bind:value={revisionForm.quantities_json} rows="3" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"></textarea></div>
              <div class="grid grid-cols-2 gap-3">
                <div><label class="block text-sm font-medium text-gray-700 mb-1">Difficulty</label><select bind:value={revisionForm.difficulty} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"><option>easy</option><option>medium</option><option>hard</option></select></div>
                <div><label class="block text-sm font-medium text-gray-700 mb-1">Time (min)</label><input type="number" bind:value={revisionForm.time_estimate_minutes} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" /></div>
              </div>
              <div><label class="block text-sm font-medium text-gray-700 mb-1">Rich Text</label><textarea bind:value={revisionForm.rich_text_html} rows="4" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"></textarea></div>
              <button onclick={createRevision} disabled={!!actionLoading} class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">
                {actionLoading === 'revision' ? 'Saving...' : 'Save Revision'}
              </button>
            </div>
          </div>
        {/if}
      </div>

      <!-- Version History -->
      <div>
        <div class="bg-white rounded-xl shadow p-6">
          <h3 class="font-semibold text-gray-900 mb-4">Version History</h3>
          <div class="space-y-3">
            {#each versions as v}
              <div class="p-3 rounded-lg {v.id === recipe.current_version_id ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'}">
                <div class="flex items-center justify-between">
                  <span class="font-medium text-sm">v{v.version_no}</span>
                  <Badge text={v.status} variant={v.status === 'approved' ? 'approved' : v.status === 'rejected' ? 'rejected' : 'draft'} />
                </div>
                <p class="text-xs text-gray-500 mt-1">{v.title}</p>
                <p class="text-xs text-gray-400">{new Date(v.created_at).toLocaleDateString()}</p>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
