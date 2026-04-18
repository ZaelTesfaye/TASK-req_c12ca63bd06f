<script>
  import {
    EVENT_READ,
    EVENT_APPROVE,
    EVENT_CREATE,
    RESERVATION_REQUEST,
    RECIPE_CREATE,
    INVENTORY_READ,
    ENTITLEMENT_REDEEM,
    REPORTS_EXPORT,
    ADMIN_ROLES
  } from '$lib/constants/permissions.js';

  let { currentPath = '/', user = null, permissions = [], collapsed = false, onToggleCollapse, onNavigate } = $props();

  /**
   * Navigation items with route, label, icon, and required permissions.
   */
  const navItems = [
    { route: '/dashboard', label: 'Dashboard', icon: 'dashboard', permissions: [] },
    { route: '/events', label: 'Events', icon: 'event', permissions: [EVENT_READ] },
    { route: '/approvals', label: 'Approvals', icon: 'approval', permissions: [EVENT_APPROVE] },
    { route: '/reservations', label: 'Reservations', icon: 'reservation', permissions: [RESERVATION_REQUEST] },
    { route: '/recipes', label: 'Recipes', icon: 'recipe', permissions: [RECIPE_CREATE] },
    { route: '/inventory', label: 'Inventory', icon: 'inventory', permissions: [INVENTORY_READ] },
    { route: '/entitlements', label: 'Entitlements', icon: 'entitlement', permissions: [ENTITLEMENT_REDEEM] },
    { route: '/check-in', label: 'Check-In', icon: 'checkin', permissions: [ENTITLEMENT_REDEEM] },
    { route: '/catalog', label: 'Catalog', icon: 'catalog', permissions: [EVENT_CREATE] },
    { route: '/reports', label: 'Reports', icon: 'reports', permissions: [REPORTS_EXPORT] },
    { route: '/admin', label: 'Admin', icon: 'admin', permissions: [ADMIN_ROLES] }
  ];

  let visibleNavItems = $derived(
    navItems.filter((item) => {
      if (item.permissions.length === 0) return true;
      return item.permissions.some((p) => permissions.includes(p));
    })
  );

  const icons = {
    dashboard: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1',
    event: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    approval: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    reservation: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
    recipe: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
    inventory: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
    entitlement: 'M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z',
    checkin: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
    catalog: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z',
    reports: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    admin: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
    adminInner: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z'
  };

  function isActive(route) {
    if (route === '/dashboard') return currentPath === '/dashboard' || currentPath === '/';
    return currentPath.startsWith(route);
  }

  function handleNavClick() {
    if (onNavigate) onNavigate();
  }
</script>

<nav
  class="sidebar"
  class:sidebar-collapsed={collapsed}
  aria-label="Main navigation"
>
  <div class="sidebar-header">
    {#if !collapsed}
      <h1 class="sidebar-brand">Hospitality Ops</h1>
    {/if}
    <button class="collapse-toggle" onclick={onToggleCollapse} aria-label="{collapsed ? 'Expand' : 'Collapse'} sidebar">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        {#if collapsed}
          <polyline points="9 18 15 12 9 6"></polyline>
        {:else}
          <polyline points="15 18 9 12 15 6"></polyline>
        {/if}
      </svg>
    </button>
  </div>

  <ul class="nav-list">
    {#each visibleNavItems as item (item.route)}
      <li>
        <a
          href={item.route}
          class="nav-link"
          class:nav-active={isActive(item.route)}
          onclick={handleNavClick}
          title={collapsed ? item.label : undefined}
        >
          <svg class="nav-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d={icons[item.icon]}></path>
            {#if item.icon === 'admin'}
              <path d={icons.adminInner}></path>
            {/if}
          </svg>
          {#if !collapsed}
            <span class="nav-label">{item.label}</span>
          {/if}
        </a>
      </li>
    {/each}
  </ul>

  <div class="sidebar-footer">
    <div class="user-info">
      {#if !collapsed}
        <div class="user-avatar">
          {user?.name?.charAt(0)?.toUpperCase() || '?'}
        </div>
        <div class="user-details">
          <span class="user-name">{user?.name || 'User'}</span>
          <span class="user-role">{user?.roles?.[0] || ''}</span>
        </div>
      {/if}
    </div>
  </div>
</nav>

<style>
  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: var(--sidebar-width);
    background-color: var(--color-primary-900);
    color: #fff;
    display: flex;
    flex-direction: column;
    z-index: 50;
    transition: width var(--transition-normal), transform var(--transition-normal);
    overflow-x: hidden;
  }

  .sidebar-collapsed {
    width: var(--sidebar-collapsed-width);
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    min-height: var(--topbar-height);
  }

  .sidebar-brand {
    font-size: 1.125rem;
    font-weight: 700;
    color: #fff;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
  }

  .collapse-toggle {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.7);
    padding: 0.25rem;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }

  .collapse-toggle:hover {
    color: #fff;
    background-color: rgba(255, 255, 255, 0.1);
  }

  .nav-list {
    list-style: none;
    margin: 0;
    padding: 0.5rem 0;
    flex: 1;
    overflow-y: auto;
  }

  .nav-link {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 1rem;
    color: rgba(255, 255, 255, 0.75);
    text-decoration: none;
    font-size: 0.875rem;
    font-weight: 500;
    border-left: 3px solid transparent;
    transition: all var(--transition-fast);
    white-space: nowrap;
  }

  .nav-link:hover {
    color: #fff;
    background-color: rgba(255, 255, 255, 0.08);
  }

  .nav-link.nav-active {
    color: #fff;
    background-color: rgba(255, 255, 255, 0.12);
    border-left-color: var(--color-accent-400);
  }

  .nav-icon {
    flex-shrink: 0;
  }

  .nav-label {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sidebar-footer {
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    padding: 0.75rem 1rem;
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .user-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background-color: var(--color-accent-500);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.875rem;
    font-weight: 600;
    flex-shrink: 0;
  }

  .user-details {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .user-details .user-name {
    font-size: 0.8125rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .user-role {
    font-size: 0.6875rem;
    color: rgba(255, 255, 255, 0.5);
    text-transform: capitalize;
  }

  @media (max-width: 1024px) {
    .sidebar {
      transform: translateX(-100%);
    }

    .sidebar-collapsed {
      width: var(--sidebar-width);
    }

    .collapse-toggle {
      display: none;
    }
  }
</style>
