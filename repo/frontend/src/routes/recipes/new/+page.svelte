<script>
  import { goto } from '$app/navigation';
  import { post, unwrap } from '$lib/api/client.js';
  import { authStore } from '$lib/stores/auth.js';

  let title = $state('');
  let slug = $state('');
  let difficulty = $state('medium');
  let timeEstimate = $state(30);
  let stepsText = $state('');
  let tagsText = $state('');
  let loading = $state(false);
  let error = $state('');
  let fieldErrors = $state({});

  const canCreate = $derived(authStore.hasPermission('recipe:create'));

  function validate() {
    const errs = {};
    if (!title.trim()) errs.title = 'Title is required';
    if (stepsText.trim() && stepsText.split('\n').filter((s) => s.trim()).length === 0) {
      errs.stepsText = 'Provide at least one step, or leave empty';
    }
    fieldErrors = errs;
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    loading = true;
    error = '';
    try {
      const steps = stepsText
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const tags = tagsText
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const body = {
        title: title.trim(),
        steps_json: steps,
        tags_json: tags,
        difficulty,
        time_estimate_minutes: Number(timeEstimate),
      };
      if (slug.trim()) body.slug = slug.trim();

      const { data: response, error: apiErr } = await post('/recipes', body);
      if (apiErr) { error = apiErr.message || 'Failed to create recipe'; loading = false; return; }
      const payload = unwrap(response);
      const recipeId = payload?.recipe?.id;
      if (!recipeId) { error = 'Recipe created but response was malformed'; loading = false; return; }
      goto(`/recipes/${recipeId}`);
    } catch (err) {
      error = 'An unexpected error occurred while creating the recipe';
    } finally {
      loading = false;
    }
  }
</script>

<div class="p-6 max-w-3xl mx-auto">
  <div class="mb-6">
    <a href="/recipes" class="text-blue-600 hover:underline text-sm">← Back to Recipes</a>
    <h1 class="text-2xl font-bold text-gray-900 mt-2">Create Recipe</h1>
  </div>

  {#if !canCreate}
    <div class="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg text-sm">
      You don't have permission to create recipes.
    </div>
  {:else}
    <form onsubmit={handleSubmit} class="bg-white rounded-xl shadow p-6 space-y-5">
      {#if error}
        <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      {/if}

      <div>
        <label for="title" class="block text-sm font-medium text-gray-700 mb-1">
          Title <span class="text-red-500">*</span>
        </label>
        <input id="title" type="text" bind:value={title} disabled={loading}
          class="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 {fieldErrors.title ? 'border-red-400' : 'border-gray-300'}"
          placeholder="e.g. Roasted Vegetable Risotto" />
        {#if fieldErrors.title}<p class="mt-1 text-xs text-red-500">{fieldErrors.title}</p>{/if}
      </div>

      <div>
        <label for="slug" class="block text-sm font-medium text-gray-700 mb-1">Slug</label>
        <input id="slug" type="text" bind:value={slug} disabled={loading}
          class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          placeholder="e.g. roasted-vegetable-risotto (auto-generated if empty)" />
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label for="difficulty" class="block text-sm font-medium text-gray-700 mb-1">Difficulty</label>
          <select id="difficulty" bind:value={difficulty} disabled={loading}
            class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        <div>
          <label for="time" class="block text-sm font-medium text-gray-700 mb-1">Time estimate (minutes)</label>
          <input id="time" type="number" bind:value={timeEstimate} min="0" disabled={loading}
            class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      <div>
        <label for="steps" class="block text-sm font-medium text-gray-700 mb-1">Steps (one per line)</label>
        <textarea id="steps" bind:value={stepsText} rows="6" disabled={loading}
          class="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm {fieldErrors.stepsText ? 'border-red-400' : 'border-gray-300'}"
          placeholder={`Heat oven to 200C\nChop vegetables\nRoast for 30 min`}></textarea>
        {#if fieldErrors.stepsText}<p class="mt-1 text-xs text-red-500">{fieldErrors.stepsText}</p>{/if}
      </div>

      <div>
        <label for="tags" class="block text-sm font-medium text-gray-700 mb-1">Tags (comma-separated)</label>
        <input id="tags" type="text" bind:value={tagsText} disabled={loading}
          class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          placeholder="vegetarian, gluten-free, main-course" />
      </div>

      <div class="flex justify-end gap-3 pt-2">
        <a href="/recipes" class="px-6 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium">Cancel</a>
        <button type="submit" disabled={loading}
          class="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 font-medium flex items-center gap-2">
          {#if loading}
            <span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            Creating...
          {:else}
            Create Recipe
          {/if}
        </button>
      </div>
    </form>
  {/if}
</div>
