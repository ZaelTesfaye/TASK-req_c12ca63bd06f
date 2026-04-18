<script>
  let { page = 1, pageSize = 20, total = 0, onPageChange } = $props();

  let totalPages = $derived(Math.max(1, Math.ceil(total / pageSize)));

  let showingFrom = $derived(total === 0 ? 0 : (page - 1) * pageSize + 1);
  let showingTo = $derived(Math.min(page * pageSize, total));

  let pageNumbers = $derived(() => {
    const pages = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);

      let start = Math.max(2, page - 1);
      let end = Math.min(totalPages - 1, page + 1);

      if (page <= 3) {
        start = 2;
        end = Math.min(maxVisible, totalPages - 1);
      } else if (page >= totalPages - 2) {
        start = Math.max(2, totalPages - maxVisible + 1);
        end = totalPages - 1;
      }

      if (start > 2) pages.push('...');
      for (let i = start; i <= end; i++) pages.push(i);
      if (end < totalPages - 1) pages.push('...');

      pages.push(totalPages);
    }
    return pages;
  });

  function goToPage(p) {
    if (p >= 1 && p <= totalPages && p !== page && onPageChange) {
      onPageChange(p);
    }
  }
</script>

<div class="flex flex-col sm:flex-row items-center justify-between gap-3 py-3">
  <p class="text-sm text-[var(--color-neutral-600)]">
    Showing <span class="font-medium">{showingFrom}</span> to
    <span class="font-medium">{showingTo}</span> of
    <span class="font-medium">{total}</span> results
  </p>

  {#if totalPages > 1}
    <nav class="flex items-center gap-1" aria-label="Pagination">
      <button
        class="px-3 py-1.5 text-sm rounded-[var(--radius-md)] border border-[var(--color-neutral-300)] text-[var(--color-neutral-700)] hover:bg-[var(--color-neutral-100)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        disabled={page <= 1}
        onclick={() => goToPage(page - 1)}
      >
        Previous
      </button>

      {#each pageNumbers() as pageNum}
        {#if pageNum === '...'}
          <span class="px-2 py-1.5 text-sm text-[var(--color-neutral-400)]">...</span>
        {:else}
          <button
            class="px-3 py-1.5 text-sm rounded-[var(--radius-md)] border transition-colors {pageNum === page
              ? 'bg-[var(--color-primary-500)] text-white border-[var(--color-primary-500)]'
              : 'border-[var(--color-neutral-300)] text-[var(--color-neutral-700)] hover:bg-[var(--color-neutral-100)]'}"
            onclick={() => goToPage(pageNum)}
            aria-current={pageNum === page ? 'page' : undefined}
          >
            {pageNum}
          </button>
        {/if}
      {/each}

      <button
        class="px-3 py-1.5 text-sm rounded-[var(--radius-md)] border border-[var(--color-neutral-300)] text-[var(--color-neutral-700)] hover:bg-[var(--color-neutral-100)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        disabled={page >= totalPages}
        onclick={() => goToPage(page + 1)}
      >
        Next
      </button>
    </nav>
  {/if}
</div>
