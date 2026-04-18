<script>
  import { get, post, unwrap } from '$lib/api/client.js';

  let events = $state([]);
  let selectedEventId = $state('');
  let selectedEvent = $state(null);
  let currentWindow = $state(null);
  let attendeeLabel = $state('');
  let overCapReason = $state('');
  let checkIns = $state([]);
  let occupancy = $state(0);
  let loading = $state(false);
  let checking = $state(false);
  let error = $state('');
  let success = $state('');
  let warning = $state('');
  let outsideWindow = $state(false);
  let overCap = $state(false);

  $effect(() => { loadEvents(); });

  async function loadEvents() {
    const [inSvcRes, approvedRes] = await Promise.all([
      get('/events?state=in_service&pageSize=100'),
      get('/events?state=approved&pageSize=100'),
    ]);
    const inSvc = unwrap(inSvcRes.data) || [];
    const approved = unwrap(approvedRes.data) || [];
    events = [...inSvc, ...approved];
  }

  async function selectEvent() {
    if (!selectedEventId) return;
    loading = true;

    const { data: eventResponse } = await get(`/events/${selectedEventId}`);
    const eventPayload = unwrap(eventResponse);
    selectedEvent = eventPayload;

    const now = new Date();
    const windows = eventPayload?.service_windows || [];
    currentWindow = windows.find(w => new Date(w.start_at) <= now && now <= new Date(w.end_at)) || null;
    outsideWindow = !currentWindow;

    const { data: ciResponse } = await get(`/events/${selectedEventId}/check-in`);
    const ciPayload = unwrap(ciResponse) || {};
    checkIns = ciPayload.checkIns || [];
    occupancy = ciPayload.occupancy ?? checkIns.length;
    overCap = occupancy >= (selectedEvent?.headcount || 0);

    loading = false;
  }

  async function handleCheckIn() {
    if (!attendeeLabel.trim()) { error = 'Enter attendee name'; return; }
    if (overCap && !overCapReason.trim()) { error = 'Over capacity - reason required'; return; }
    checking = true;
    error = ''; success = ''; warning = '';
    const body = { attendee_label: attendeeLabel.trim() };
    if (overCapReason.trim()) body.over_cap_reason = overCapReason.trim();
    const { data: response, error: err } = await post(`/events/${selectedEventId}/check-in`, body);
    const payload = unwrap(response);
    if (err) { error = err.message; }
    else {
      success = `${attendeeLabel} checked in!`;
      if (payload?.warning) warning = payload.warningMessage || 'Warning: check-in outside window or over capacity';
      occupancy = payload?.occupancy ?? occupancy + 1;
      overCap = occupancy >= (selectedEvent?.headcount || 0);
      attendeeLabel = '';
      overCapReason = '';
      checkIns = [{ attendee_label: body.attendee_label, checked_in_at: new Date().toISOString() }, ...checkIns].slice(0, 15);
    }
    checking = false;
    setTimeout(() => { success = ''; }, 3000);
  }
</script>

<div class="min-h-screen bg-gray-900 text-white p-4 md:p-8">
  <!-- Event Selector -->
  {#if !selectedEventId || !selectedEvent}
    <div class="max-w-lg mx-auto mt-20">
      <h1 class="text-3xl font-bold text-center mb-8">Event Check-In</h1>
      <select bind:value={selectedEventId} onchange={selectEvent}
        class="w-full px-6 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-lg text-white">
        <option value="">Select an event...</option>
        {#each events as evt}<option value={evt.id}>{evt.title} — {evt.event_date}</option>{/each}
      </select>
    </div>
  {:else}
    <!-- Check-In Interface -->
    <div class="max-w-2xl mx-auto">
      <!-- Event Header -->
      <div class="text-center mb-6">
        <h1 class="text-2xl font-bold">{selectedEvent.title}</h1>
        <p class="text-gray-400">{selectedEvent.event_date}</p>
        <button onclick={() => { selectedEventId = ''; selectedEvent = null; }} class="text-sm text-blue-400 hover:underline mt-1">Change Event</button>
      </div>

      <!-- Service Window Banner -->
      {#if currentWindow}
        <div class="bg-green-800 rounded-xl p-4 text-center mb-4">
          <p class="text-sm text-green-300">Active Window</p>
          <p class="text-xl font-bold">{currentWindow.label}</p>
          <p class="text-green-300">{new Date(currentWindow.start_at).toLocaleTimeString()} — {new Date(currentWindow.end_at).toLocaleTimeString()}</p>
        </div>
      {:else}
        <div class="bg-yellow-800 rounded-xl p-4 text-center mb-4">
          <p class="text-xl font-bold text-yellow-200">No Active Service Window</p>
          <p class="text-yellow-300 text-sm">Check-ins will be flagged as outside window</p>
        </div>
      {/if}

      <!-- Occupancy Counter -->
      <div class="bg-gray-800 rounded-xl p-6 text-center mb-6">
        <p class="text-5xl font-bold {overCap ? 'text-red-400' : 'text-white'}">{occupancy} / {selectedEvent.headcount}</p>
        <p class="text-gray-400 mt-1">Checked In</p>
        <div class="w-full bg-gray-700 rounded-full h-3 mt-3">
          <div class="h-3 rounded-full transition-all {overCap ? 'bg-red-500' : 'bg-green-500'}"
            style="width: {Math.min(100, (occupancy / Math.max(1, selectedEvent.headcount)) * 100)}%"></div>
        </div>
      </div>

      {#if overCap}
        <div class="bg-red-900 border border-red-700 rounded-xl p-4 text-center mb-4">
          <p class="text-red-200 font-bold">At or Over Capacity</p>
          <p class="text-red-300 text-sm">Additional check-ins require a reason</p>
        </div>
      {/if}

      <!-- Check-In Input -->
      <div class="space-y-4 mb-6">
        <input type="text" bind:value={attendeeLabel} placeholder="Attendee name or ID"
          class="w-full px-6 py-5 bg-gray-800 border border-gray-700 rounded-2xl text-2xl text-center text-white placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
          onkeydown={(e) => e.key === 'Enter' && handleCheckIn()} />

        {#if overCap}
          <input type="text" bind:value={overCapReason} placeholder="Reason for over-capacity check-in"
            class="w-full px-6 py-4 bg-gray-800 border border-red-700 rounded-2xl text-lg text-center text-white placeholder-gray-500" />
        {/if}

        <button onclick={handleCheckIn} disabled={checking || !attendeeLabel.trim()}
          class="w-full py-5 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 text-white text-2xl font-bold rounded-2xl transition-colors active:scale-[0.98]"
          style="min-height: 64px">
          {#if checking}
            <span class="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin inline-block"></span>
          {:else}
            CHECK IN
          {/if}
        </button>
      </div>

      <!-- Feedback -->
      {#if error}<div class="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded-xl mb-4 text-center">{error}</div>{/if}
      {#if success}<div class="bg-green-900 border border-green-700 text-green-200 px-4 py-3 rounded-xl mb-4 text-center text-lg font-bold">{success}</div>{/if}
      {#if warning}<div class="bg-yellow-900 border border-yellow-700 text-yellow-200 px-4 py-3 rounded-xl mb-4 text-center">{warning}</div>{/if}

      <!-- Recent Check-Ins -->
      <div class="bg-gray-800 rounded-xl p-4">
        <h3 class="text-gray-400 text-sm font-medium mb-3">Recent Check-Ins</h3>
        {#if checkIns.length === 0}
          <p class="text-gray-500 text-center py-4">No check-ins yet</p>
        {:else}
          <div class="space-y-2">
            {#each checkIns.slice(0, 10) as ci}
              <div class="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
                <span class="font-medium">{ci.attendee_label}</span>
                <span class="text-gray-400 text-sm">{new Date(ci.checked_in_at).toLocaleTimeString()}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
