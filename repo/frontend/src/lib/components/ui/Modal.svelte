<script>
  let { open = false, title = '', onClose, children } = $props();

  let dialogEl = $state(null);
  let previouslyFocused = $state(null);

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget && onClose) {
      onClose();
    }
  }

  function handleKeydown(e) {
    if (e.key === 'Escape' && onClose) {
      onClose();
    }

    // Focus trap
    if (e.key === 'Tab' && dialogEl) {
      const focusable = dialogEl.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  $effect(() => {
    if (open) {
      previouslyFocused = document.activeElement;
      // Focus the dialog panel after a tick so it renders first
      setTimeout(() => {
        if (dialogEl) {
          const firstFocusable = dialogEl.querySelector(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          if (firstFocusable) firstFocusable.focus();
        }
      }, 50);

      // Prevent body scroll
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    }
  });
</script>

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
    onkeydown={handleKeydown}
  >
    <!-- Backdrop -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="absolute inset-0 bg-black/50 transition-opacity duration-300"
      onclick={handleBackdropClick}
      style="animation: fadeIn 0.2s ease-out"
    ></div>

    <!-- Panel -->
    <div
      bind:this={dialogEl}
      class="relative bg-white rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] w-full max-w-lg max-h-[85vh] flex flex-col"
      style="animation: modalSlideIn 0.25s ease-out"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-[var(--color-neutral-200)]">
        <h2 id="modal-title" class="text-lg font-semibold text-[var(--color-neutral-900)] m-0">
          {title}
        </h2>
        <button
          class="p-1.5 rounded-[var(--radius-md)] text-[var(--color-neutral-400)] hover:text-[var(--color-neutral-700)] hover:bg-[var(--color-neutral-100)] transition-colors"
          onclick={onClose}
          aria-label="Close modal"
        >
          <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Body -->
      <div class="px-6 py-4 overflow-y-auto flex-1">
        {@render children()}
      </div>
    </div>
  </div>
{/if}

<style>
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes modalSlideIn {
    from {
      opacity: 0;
      transform: translateY(-10px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
</style>
