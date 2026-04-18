/**
 * Component-level behavioral logic tests for the Hospitality Operations Management System.
 *
 * Rather than rendering Svelte 5 components in jsdom (which has limited support
 * for runes like $state / $derived / $effect), these tests exercise the real
 * production modules that drive UI component behavior:
 *
 *   - Badge variant logic        (src/lib/utils/ui-helpers.js)
 *   - Pagination math            (src/lib/utils/pagination.js)
 *   - File upload validation      (src/lib/utils/file-validation.js)
 *   - Toast auto-dismiss timing   (src/lib/utils/toast.js)
 *   - Auth-gated navigation       (src/lib/stores/auth.js + src/lib/utils/navigation.js)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Real production imports
import { getBadgeClass, BADGE_VARIANTS } from '../../src/lib/utils/ui-helpers.js';
import { computePagination, generatePageNumbers } from '../../src/lib/utils/pagination.js';
import { validateFile, formatFileSize, isImageType } from '../../src/lib/utils/file-validation.js';
import { createToastState } from '../../src/lib/utils/toast.js';
import { getVisibleNavItems, navItems } from '../../src/lib/utils/navigation.js';

// ============================================================================
// 1. BADGE VARIANT LOGIC
// ============================================================================
describe('Badge variant logic (ui-helpers)', () => {
  const STATUS_VARIANTS = ['draft', 'submitted', 'approved', 'in_service', 'closed', 'pending', 'rejected'];

  it('every known status maps to a distinct CSS class string', () => {
    const classes = STATUS_VARIANTS.map(v => getBadgeClass(v));
    // All values should be unique strings
    expect(new Set(classes).size).toBe(STATUS_VARIANTS.length);
  });

  it('unknown variants fall back to info', () => {
    expect(getBadgeClass('banana')).toBe(BADGE_VARIANTS.info);
    expect(getBadgeClass(null)).toBe(BADGE_VARIANTS.info);
    expect(getBadgeClass(undefined)).toBe(BADGE_VARIANTS.info);
    expect(getBadgeClass('')).toBe(BADGE_VARIANTS.info);
  });

  it('all variants include bg-, text-, and border- classes', () => {
    for (const variant of Object.keys(BADGE_VARIANTS)) {
      const cls = getBadgeClass(variant);
      expect(cls).toMatch(/bg-/);
      expect(cls).toMatch(/text-/);
      expect(cls).toMatch(/border-/);
    }
  });

  it('getBadgeClass is pure: same input always gives same output', () => {
    for (const variant of STATUS_VARIANTS) {
      const first = getBadgeClass(variant);
      const second = getBadgeClass(variant);
      expect(first).toBe(second);
    }
  });

  it('each status has appropriate color associations', () => {
    expect(getBadgeClass('draft')).toContain('gray');
    expect(getBadgeClass('submitted')).toContain('blue');
    expect(getBadgeClass('approved')).toContain('green');
    expect(getBadgeClass('in_service')).toContain('purple');
    expect(getBadgeClass('pending')).toContain('yellow');
    expect(getBadgeClass('rejected')).toContain('red');
  });
});

// ============================================================================
// 2. PAGINATION LOGIC
// ============================================================================
describe('Pagination behavioral contract', () => {
  it('standard first page displays correct range text', () => {
    const p = computePagination(1, 20, 100);
    expect(p.totalPages).toBe(5);
    expect(`${p.start} to ${p.end} of 100`).toBe('1 to 20 of 100');
  });

  it('last partial page clamps end to total', () => {
    const p = computePagination(3, 10, 25);
    expect(p.totalPages).toBe(3);
    expect(`${p.start} to ${p.end} of 25`).toBe('21 to 25 of 25');
  });

  it('zero items shows "0 to 0 of 0"', () => {
    const p = computePagination(1, 20, 0);
    expect(p.totalPages).toBe(0);
    expect(`${p.start} to ${p.end} of 0`).toBe('0 to 0 of 0');
  });

  it('previous disabled on page 1, next enabled', () => {
    const p = computePagination(1, 10, 50);
    expect(p.hasPrevious).toBe(false);
    expect(p.hasNext).toBe(true);
  });

  it('next disabled on last page, previous enabled', () => {
    const p = computePagination(5, 10, 50);
    expect(p.hasNext).toBe(false);
    expect(p.hasPrevious).toBe(true);
  });

  it('page numbers generation for small set returns sequential', () => {
    expect(generatePageNumbers(1, 3)).toEqual([1, 2, 3]);
  });

  it('page numbers generation for large set collapses with ellipsis', () => {
    const pages = generatePageNumbers(10, 20);
    expect(pages).toContain('...');
    expect(pages[0]).toBe(1);
    expect(pages[pages.length - 1]).toBe(20);
  });
});

// ============================================================================
// 3. FILE UPLOAD VALIDATION LOGIC
// ============================================================================
describe('File upload validation behavioral contract', () => {
  const MB = 1024 * 1024;

  it('PDF passes validation', () => {
    expect(validateFile({ size: 1 * MB, type: 'application/pdf' })).toEqual([]);
  });

  it('PNG passes validation', () => {
    expect(validateFile({ size: 500000, type: 'image/png' })).toEqual([]);
  });

  it('JPEG passes validation', () => {
    expect(validateFile({ size: 500000, type: 'image/jpeg' })).toEqual([]);
  });

  it('WebP passes validation', () => {
    expect(validateFile({ size: 500000, type: 'image/webp' })).toEqual([]);
  });

  it('ZIP fails validation', () => {
    const errors = validateFile({ size: 1000, type: 'application/zip' });
    expect(errors).toContain('File type not allowed');
  });

  it('EXE fails validation', () => {
    const errors = validateFile({ size: 1000, type: 'application/x-msdownload' });
    expect(errors).toContain('File type not allowed');
  });

  it('HTML fails validation', () => {
    const errors = validateFile({ size: 1000, type: 'text/html' });
    expect(errors).toContain('File type not allowed');
  });

  it('25 MB file passes, 26 MB file fails', () => {
    expect(validateFile({ size: 25 * MB, type: 'application/pdf' })).toEqual([]);
    const errors = validateFile({ size: 26 * MB, type: 'application/pdf' });
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('25MB');
  });

  it('formatFileSize formats correctly', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1.5 * MB)).toBe('1.5 MB');
  });

  it('isImageType detects images correctly', () => {
    expect(isImageType('image/png')).toBe(true);
    expect(isImageType('image/jpeg')).toBe(true);
    expect(isImageType('application/pdf')).toBe(false);
    expect(isImageType(null)).toBe(false);
  });
});

// ============================================================================
// 4. TOAST AUTO-DISMISS TIMING
// ============================================================================
describe('Toast auto-dismiss timing', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('toast appears and auto-dismisses after its duration', () => {
    const ts = createToastState();
    ts.add('Saved!', 'success', 3000);
    expect(ts.get().length).toBe(1);

    vi.advanceTimersByTime(3000);
    expect(ts.get().length).toBe(0);
  });

  it('toast with duration 0 persists indefinitely', () => {
    const ts = createToastState();
    ts.add('Persistent', 'warning', 0);
    vi.advanceTimersByTime(60000);
    expect(ts.get().length).toBe(1);
  });

  it('manual remove before auto-dismiss', () => {
    const ts = createToastState();
    const id = ts.add('Temporary', 'info', 5000);
    ts.remove(id);
    expect(ts.get().length).toBe(0);

    // Ensure the delayed auto-dismiss does not throw or re-add
    vi.advanceTimersByTime(5000);
    expect(ts.get().length).toBe(0);
  });

  it('clear removes all before any auto-dismiss fires', () => {
    const ts = createToastState();
    ts.add('A', 'info', 1000);
    ts.add('B', 'error', 2000);
    ts.clear();
    expect(ts.get().length).toBe(0);

    vi.advanceTimersByTime(2000);
    expect(ts.get().length).toBe(0);
  });
});

// ============================================================================
// 5. AUTH-GATED NAVIGATION
// ============================================================================
describe('Auth-gated navigation filtering', () => {
  // We need sessionStorage mocked for the auth store import
  const storage = {};
  const mockSessionStorage = {
    getItem: vi.fn((key) => storage[key] ?? null),
    setItem: vi.fn((key, value) => { storage[key] = value; }),
    removeItem: vi.fn((key) => { delete storage[key]; }),
    clear: vi.fn(() => { for (const key of Object.keys(storage)) delete storage[key]; })
  };

  beforeEach(() => {
    if (typeof globalThis.sessionStorage === 'undefined') {
      Object.defineProperty(globalThis, 'sessionStorage', {
        value: mockSessionStorage,
        writable: true,
        configurable: true
      });
    }
  });

  it('event planner sees correct nav items', async () => {
    const plannerPermissions = [
      'event:create', 'event:read', 'event:update',
      'resource:request',
      'attachment:upload', 'attachment:read',
      'reports:export',
      'entitlement:redeem'
    ];

    const visible = getVisibleNavItems(plannerPermissions);
    const labels = visible.map(item => item.label);

    // Planner should see these
    expect(labels).toContain('Dashboard');    // no permission required
    expect(labels).toContain('Events');       // event:read
    expect(labels).toContain('Catalog');      // event:create
    expect(labels).toContain('Reports');      // reports:export
    expect(labels).toContain('Entitlements'); // entitlement:redeem

    // Planner should NOT see these
    expect(labels).not.toContain('Admin');      // needs admin:roles
    expect(labels).not.toContain('Approvals');  // needs event:approve
    expect(labels).not.toContain('Inventory');  // needs inventory:read
    expect(labels).not.toContain('Recipes');    // needs recipe:create
    expect(labels).not.toContain('Check-In');   // needs event:service
  });

  it('admin sees all nav items', () => {
    const adminPermissions = [
      'event:create', 'event:read', 'event:update', 'event:approve',
      'event:service',
      'reservation:request',
      'recipe:create',
      'inventory:read',
      'entitlement:redeem',
      'reports:export',
      'admin:roles',
      'attachment:upload', 'attachment:read'
    ];

    const visible = getVisibleNavItems(adminPermissions);
    expect(visible.length).toBe(navItems.length);
  });

  it('unauthenticated user sees only permissionless items', () => {
    const visible = getVisibleNavItems([]);
    const labels = visible.map(item => item.label);

    // Only Dashboard has no permission requirement
    expect(labels).toEqual(['Dashboard']);
  });

  it('user with single permission sees Dashboard plus matching items', () => {
    const visible = getVisibleNavItems(['event:read']);
    const labels = visible.map(item => item.label);

    expect(labels).toContain('Dashboard');
    expect(labels).toContain('Events');
    expect(labels.length).toBe(2);
  });

  it('auth store login + getVisibleNavItems integration', async () => {
    vi.resetModules();
    mockSessionStorage.clear();
    const { authState } = await import('../../src/lib/stores/auth.js');

    authState.login({
      user: { id: '1', email: 'planner@hotel.com', name: 'Planner', roles: ['event_planner'] },
      token: 'tok',
      refreshToken: 'ref',
      permissions: ['event:create', 'event:read', 'event:update', 'resource:request', 'attachment:upload', 'attachment:read', 'reports:export', 'entitlement:redeem'],
      roles: ['event_planner']
    });

    const perms = authState.get().permissions;
    const visible = getVisibleNavItems(perms);
    const labels = visible.map(item => item.label);

    expect(labels).toContain('Dashboard');
    expect(labels).toContain('Events');
    expect(labels).toContain('Catalog');
    expect(labels).toContain('Reports');
    expect(labels).toContain('Entitlements');
    // Check-In now requires event:service (aligned with the backend
    // authorize() gate on POST /events/:id/check-in); a planner with
    // only entitlement:redeem no longer sees it.
    expect(labels).not.toContain('Check-In');
    expect(labels).not.toContain('Admin');
    expect(labels).not.toContain('Approvals');
    expect(labels).not.toContain('Inventory');
    expect(labels).not.toContain('Recipes');

    // Clean up
    authState.logout();
  });
});
