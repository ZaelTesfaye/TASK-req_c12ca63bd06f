<script>
  import { goto } from '$app/navigation';
  import { post, get } from '$lib/api/client.js';

  let title = $state('');
  let description = $state('');
  let eventDate = $state('');
  let headcount = $state(1);
  let budgetAmount = $state(0);
  let serviceWindows = $state([{ label: '', start_at: '', end_at: '' }]);
  let loading = $state(false);
  let error = $state('');
  let fieldErrors = $state({});

  function addWindow() {
    serviceWindows = [...serviceWindows, { label: '', start_at: '', end_at: '' }];
  }

  function removeWindow(i) {
    serviceWindows = serviceWindows.filter((_, idx) => idx !== i);
  }

  function validate() {
    const errs = {};
    if (!title.trim()) errs.title = 'Title is required';
    if (!eventDate) errs.eventDate = 'Event date is required';
    if (!headcount || headcount < 1) errs.headcount = 'Headcount must be at least 1';
    if (budgetAmount < 0) errs.budgetAmount = 'Budget cannot be negative';
    fieldErrors = errs;
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    loading = true;
    error = '';
    try {
      const { data: createResponse, error: evtErr } = await post('/events', {
        title: title.trim(),
        description: description.trim(),
        event_date: eventDate,
        headcount: Number(headcount),
        budget_amount: Number(budgetAmount)
      });
      if (evtErr) { error = evtErr.message; loading = false; return; }
      const eventId = createResponse.data.id;

      // Add service windows
      for (const sw of serviceWindows) {
        if (sw.label && sw.start_at && sw.end_at) {
          await post(`/events/${eventId}/service-windows`, {
            label: sw.label,
            start_at: new Date(sw.start_at).toISOString(),
            end_at: new Date(sw.end_at).toISOString()
          });
        }
      }

      goto(`/events/${eventId}`);
    } catch (err) {
      error = 'Failed to create event';
    } finally {
      loading = false;
    }
  }
</script>

<div class="p-6 max-w-4xl mx-auto">
  <div class="mb-6">
    <a href="/events" class="text-blue-600 hover:underline text-sm">← Back to Events</a>
    <h1 class="text-2xl font-bold text-gray-900 mt-2">Create New Event</h1>
  </div>

  <form onsubmit={handleSubmit} class="space-y-6">
    {#if error}
      <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
    {/if}

    <div class="bg-white rounded-xl shadow p-6 space-y-4">
      <h2 class="text-lg font-semibold text-gray-900">Event Details</h2>

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Title <span class="text-red-500">*</span></label>
        <input type="text" bind:value={title} class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Event title" />
        {#if fieldErrors.title}<p class="mt-1 text-xs text-red-500">{fieldErrors.title}</p>{/if}
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea bind:value={description} rows="3" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Event description"></textarea>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Event Date <span class="text-red-500">*</span></label>
          <input type="date" bind:value={eventDate} class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
          {#if fieldErrors.eventDate}<p class="mt-1 text-xs text-red-500">{fieldErrors.eventDate}</p>{/if}
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Headcount <span class="text-red-500">*</span></label>
          <input type="number" bind:value={headcount} min="1" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
          {#if fieldErrors.headcount}<p class="mt-1 text-xs text-red-500">{fieldErrors.headcount}</p>{/if}
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Budget ($)</label>
          <input type="number" bind:value={budgetAmount} min="0" step="0.01" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
          <p class="mt-1 text-xs text-gray-400">Default cap: $25,000.00</p>
          {#if fieldErrors.budgetAmount}<p class="mt-1 text-xs text-red-500">{fieldErrors.budgetAmount}</p>{/if}
        </div>
      </div>
    </div>

    <!-- Service Windows -->
    <div class="bg-white rounded-xl shadow p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-gray-900">Service Windows</h2>
        <button type="button" onclick={addWindow} class="text-sm text-blue-600 hover:underline">+ Add Window</button>
      </div>
      {#each serviceWindows as sw, i}
        <div class="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3 p-3 bg-gray-50 rounded-lg">
          <div>
            <label class="block text-xs text-gray-500 mb-1">Label</label>
            <input type="text" bind:value={sw.label} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="e.g. Breakfast" />
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Start</label>
            <input type="datetime-local" bind:value={sw.start_at} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">End</label>
            <input type="datetime-local" bind:value={sw.end_at} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div class="flex items-end">
            {#if serviceWindows.length > 1}
              <button type="button" onclick={() => removeWindow(i)} class="px-3 py-2 text-red-500 hover:bg-red-50 rounded-lg text-sm">Remove</button>
            {/if}
          </div>
        </div>
      {/each}
    </div>

    <div class="flex justify-end gap-3">
      <a href="/events" class="px-6 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium">Cancel</a>
      <button type="submit" disabled={loading}
        class="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 font-medium flex items-center gap-2">
        {#if loading}
          <span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
          Creating...
        {:else}
          Create Event
        {/if}
      </button>
    </div>
  </form>
</div>
