<script>
  let { text = '', variant = 'info' } = $props();

  const variantStyles = {
    draft: 'bg-[var(--color-neutral-100)] text-[var(--color-neutral-700)] border-[var(--color-neutral-300)]',
    submitted: 'bg-[var(--color-info-light)] text-[var(--color-info)] border-[var(--color-info)]',
    approved: 'bg-[var(--color-success-light)] text-[var(--color-success)] border-[var(--color-success)]',
    in_service: 'bg-purple-50 text-purple-700 border-purple-300',
    closed: 'bg-[var(--color-neutral-100)] text-[var(--color-neutral-600)] border-[var(--color-neutral-400)]',
    pending: 'bg-[var(--color-warning-light)] text-[var(--color-warning)] border-[var(--color-warning)]',
    rejected: 'bg-[var(--color-error-light)] text-[var(--color-error)] border-[var(--color-error)]',
    active: 'bg-[var(--color-success-light)] text-[var(--color-success)] border-[var(--color-success)]',
    warning: 'bg-[var(--color-warning-light)] text-[var(--color-warning)] border-[var(--color-warning)]',
    error: 'bg-[var(--color-error-light)] text-[var(--color-error)] border-[var(--color-error)]',
    success: 'bg-[var(--color-success-light)] text-[var(--color-success)] border-[var(--color-success)]',
    info: 'bg-[var(--color-info-light)] text-[var(--color-info)] border-[var(--color-info)]'
  };

  let badgeClass = $derived(variantStyles[variant] || variantStyles.info);
</script>

<span
  class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border {badgeClass}"
>
  {text}
</span>
