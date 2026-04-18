<script>
  let {
    columns = [],
    data = [],
    loading = false,
    emptyMessage = 'No data available',
    onSort
  } = $props();

  let sortKey = $state('');
  let sortDirection = $state('asc');

  function handleSort(column) {
    if (!column.sortable || !onSort) return;

    if (sortKey === column.key) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = column.key;
      sortDirection = 'asc';
    }
    onSort({ key: sortKey, direction: sortDirection });
  }

  function getCellValue(row, column) {
    if (column.render) {
      return column.render(row);
    }
    const val = row[column.key];
    return val != null ? val : '';
  }
</script>

<div class="w-full overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-neutral-200)]">
  <table class="w-full text-sm text-left">
    <thead class="bg-[var(--color-neutral-50)] border-b border-[var(--color-neutral-200)]">
      <tr>
        {#each columns as column (column.key)}
          <th
            class="px-4 py-3 font-semibold text-[var(--color-neutral-700)] whitespace-nowrap {column.sortable ? 'cursor-pointer select-none hover:bg-[var(--color-neutral-100)]' : ''}"
            onclick={() => handleSort(column)}
          >
            <div class="flex items-center gap-1.5">
              <span>{column.label}</span>
              {#if column.sortable}
                <span class="flex flex-col">
                  <svg
                    class="w-3 h-3 {sortKey === column.key && sortDirection === 'asc' ? 'text-[var(--color-primary-500)]' : 'text-[var(--color-neutral-400)]'}"
                    viewBox="0 0 10 6"
                    fill="currentColor"
                  >
                    <path d="M5 0L10 6H0z" />
                  </svg>
                  <svg
                    class="w-3 h-3 -mt-0.5 {sortKey === column.key && sortDirection === 'desc' ? 'text-[var(--color-primary-500)]' : 'text-[var(--color-neutral-400)]'}"
                    viewBox="0 0 10 6"
                    fill="currentColor"
                  >
                    <path d="M5 6L0 0h10z" />
                  </svg>
                </span>
              {/if}
            </div>
          </th>
        {/each}
      </tr>
    </thead>
    <tbody class="divide-y divide-[var(--color-neutral-200)]">
      {#if loading}
        {#each Array(5) as _, i}
          <tr class="animate-pulse">
            {#each columns as column (column.key)}
              <td class="px-4 py-3">
                <div class="h-4 bg-[var(--color-neutral-200)] rounded w-3/4"></div>
              </td>
            {/each}
          </tr>
        {/each}
      {:else if data.length === 0}
        <tr>
          <td colspan={columns.length} class="px-4 py-12 text-center text-[var(--color-neutral-500)]">
            <div class="flex flex-col items-center gap-2">
              <svg class="w-10 h-10 text-[var(--color-neutral-300)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
              <p>{emptyMessage}</p>
            </div>
          </td>
        </tr>
      {:else}
        {#each data as row, rowIndex (rowIndex)}
          <tr class="hover:bg-[var(--color-neutral-50)] transition-colors">
            {#each columns as column (column.key)}
              <td class="px-4 py-3 text-[var(--color-neutral-800)]">
                {getCellValue(row, column)}
              </td>
            {/each}
          </tr>
        {/each}
      {/if}
    </tbody>
  </table>
</div>
