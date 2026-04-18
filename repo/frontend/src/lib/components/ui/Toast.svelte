<script>
  let { message = '', type = 'info', duration = 5000 } = $props();

  let visible = $state(false);
  let exiting = $state(false);

  const iconPaths = {
    success: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    error: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z',
    warning: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
    info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
  };

  const typeStyles = {
    success: 'bg-[var(--color-success-light)] border-[var(--color-success)] text-[var(--color-success)]',
    error: 'bg-[var(--color-error-light)] border-[var(--color-error)] text-[var(--color-error)]',
    warning: 'bg-[var(--color-warning-light)] border-[var(--color-warning)] text-[var(--color-warning)]',
    info: 'bg-[var(--color-info-light)] border-[var(--color-info)] text-[var(--color-info)]'
  };

  function dismiss() {
    exiting = true;
    setTimeout(() => {
      visible = false;
    }, 300);
  }

  $effect(() => {
    if (message) {
      visible = true;
      exiting = false;
    }
  });

  $effect(() => {
    if (visible && duration > 0) {
      const timer = setTimeout(dismiss, duration);
      return () => clearTimeout(timer);
    }
  });
</script>

{#if visible}
  <div
    class="fixed top-4 right-4 z-[9999] max-w-sm w-full pointer-events-auto"
    role="alert"
    aria-live="assertive"
  >
    <div
      class="flex items-start gap-3 p-4 border-l-4 rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] transition-all duration-300 {typeStyles[type] || typeStyles.info}"
      class:translate-x-0={!exiting}
      class:opacity-100={!exiting}
      class:translate-x-full={exiting}
      class:opacity-0={exiting}
      style="animation: {exiting ? 'none' : 'slideIn 0.3s ease-out'}"
    >
      <svg
        class="w-5 h-5 flex-shrink-0 mt-0.5"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d={iconPaths[type] || iconPaths.info} />
      </svg>
      <p class="flex-1 text-sm font-medium" style="color: var(--color-neutral-800)">
        {message}
      </p>
      <button
        class="flex-shrink-0 p-0.5 rounded hover:bg-black/5 transition-colors"
        onclick={dismiss}
        aria-label="Dismiss notification"
      >
        <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>
{/if}

<style>
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
</style>
