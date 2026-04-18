<script>
  let { children } = $props();
</script>

<div class="min-h-screen flex items-center justify-center bg-[var(--color-neutral-50)] px-4 py-8">
  {@render children()}
</div>
