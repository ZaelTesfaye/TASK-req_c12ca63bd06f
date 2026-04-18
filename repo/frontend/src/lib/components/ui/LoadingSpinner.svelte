<script>
  let { size = 'md', message = '' } = $props();

  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4'
  };

  let spinnerClass = $derived(sizeClasses[size] || sizeClasses.md);
</script>

<div class="flex flex-col items-center justify-center gap-3" role="status" aria-live="polite">
  <div
    class="{spinnerClass} rounded-full border-[var(--color-neutral-200)] border-t-[var(--color-primary-500)] animate-spin"
  ></div>
  {#if message}
    <p class="text-sm text-[var(--color-neutral-600)]">{message}</p>
  {/if}
  <span class="visually-hidden">Loading...</span>
</div>
