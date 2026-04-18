<script>
  let { entries = [] } = $props();

  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleString();
  }

  function actionColor(action) {
    const colors = {
      'Created': 'bg-blue-100 text-blue-700',
      'Updated': 'bg-yellow-100 text-yellow-700',
      'Approved': 'bg-green-100 text-green-700',
      'Rejected': 'bg-red-100 text-red-700',
      'StateChanged': 'bg-purple-100 text-purple-700',
    };
    return colors[action] || 'bg-gray-100 text-gray-700';
  }

  let expandedIdx = $state(-1);
</script>

<div class="space-y-0">
  {#each entries as entry, i}
    <div class="flex gap-3 {i < entries.length - 1 ? 'pb-4' : ''}">
      <div class="flex flex-col items-center">
        <div class="w-2.5 h-2.5 bg-blue-500 rounded-full mt-1.5 flex-shrink-0"></div>
        {#if i < entries.length - 1}
          <div class="w-0.5 bg-gray-200 flex-1 mt-1"></div>
        {/if}
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-sm font-medium text-gray-900">{entry.actor || 'System'}</span>
          <span class="text-xs px-2 py-0.5 rounded-full {actionColor(entry.action)}">{entry.action}</span>
          <span class="text-xs text-gray-400">{formatTime(entry.timestamp)}</span>
        </div>
        {#if entry.notes}
          <p class="text-sm text-gray-500 mt-1">{entry.notes}</p>
        {/if}
        {#if entry.before || entry.after}
          <button onclick={() => expandedIdx = expandedIdx === i ? -1 : i} class="text-xs text-blue-600 hover:underline mt-1">
            {expandedIdx === i ? 'Hide' : 'Show'} details
          </button>
          {#if expandedIdx === i}
            <div class="mt-2 text-xs bg-gray-50 rounded p-2 overflow-auto max-h-40">
              {#if entry.before}<div class="text-red-600">- {JSON.stringify(entry.before, null, 2)}</div>{/if}
              {#if entry.after}<div class="text-green-600">+ {JSON.stringify(entry.after, null, 2)}</div>{/if}
            </div>
          {/if}
        {/if}
      </div>
    </div>
  {/each}
</div>
