<script>
  let { label = '', error = '', required = false, hint = '', children } = $props();
</script>

<div class="mb-4">
  {#if label}
    <label class="block text-sm font-medium text-[var(--color-neutral-700)] mb-1">
      {label}
      {#if required}
        <span class="text-[var(--color-error)] ml-0.5" aria-hidden="true">*</span>
      {/if}
    </label>
  {/if}

  {@render children()}

  {#if error}
    <p class="mt-1 text-xs text-[var(--color-error)]" role="alert">{error}</p>
  {:else if hint}
    <p class="mt-1 text-xs text-[var(--color-neutral-500)]">{hint}</p>
  {/if}
</div>
