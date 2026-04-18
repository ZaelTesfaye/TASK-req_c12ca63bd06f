/**
 * Unit tests for UI state rendering logic.
 *
 * Tests the ui-helpers module (src/lib/utils/ui-helpers.js) which provides
 * pure functions for determining UI states and badge variant styling.
 */
import { describe, it, expect } from 'vitest';
import { getUIState, BADGE_VARIANTS, getBadgeClass } from '../../src/lib/utils/ui-helpers.js';

// ---------------------------------------------------------------------------
// Tests - UI state classification
// ---------------------------------------------------------------------------
describe('getUIState', () => {
  it('returns "loading" when loading is true', () => {
    expect(getUIState({ loading: true, error: '', data: null })).toBe('loading');
  });

  it('loading takes priority over error', () => {
    expect(getUIState({ loading: true, error: 'some error', data: null })).toBe('loading');
  });

  it('loading takes priority over data', () => {
    expect(getUIState({ loading: true, error: '', data: [{ id: 1 }] })).toBe('loading');
  });

  it('returns "error" when error string is non-empty and not loading', () => {
    expect(getUIState({ loading: false, error: 'Failed to load', data: null })).toBe('error');
  });

  it('error takes priority over data', () => {
    expect(getUIState({ loading: false, error: 'Failed', data: [{ id: 1 }] })).toBe('error');
  });

  it('returns "empty" when data is null', () => {
    expect(getUIState({ loading: false, error: '', data: null })).toBe('empty');
  });

  it('returns "empty" when data is undefined', () => {
    expect(getUIState({ loading: false, error: '', data: undefined })).toBe('empty');
  });

  it('returns "empty" when data is an empty array', () => {
    expect(getUIState({ loading: false, error: '', data: [] })).toBe('empty');
  });

  it('returns "success" when data is a non-empty array', () => {
    expect(getUIState({ loading: false, error: '', data: [{ id: 1 }] })).toBe('success');
  });

  it('returns "success" for non-array truthy data', () => {
    expect(getUIState({ loading: false, error: '', data: { id: 1 } })).toBe('success');
  });

  it('returns "success" for numeric data', () => {
    expect(getUIState({ loading: false, error: '', data: 42 })).toBe('success');
  });

  it('returns "success" for string data', () => {
    expect(getUIState({ loading: false, error: '', data: 'hello' })).toBe('success');
  });

  it('returns "empty" when error is falsy empty string', () => {
    expect(getUIState({ loading: false, error: '', data: null })).toBe('empty');
  });
});

// ---------------------------------------------------------------------------
// Tests - BADGE_VARIANTS constant
// ---------------------------------------------------------------------------
describe('BADGE_VARIANTS', () => {
  it('is a non-null object', () => {
    expect(BADGE_VARIANTS).toBeDefined();
    expect(typeof BADGE_VARIANTS).toBe('object');
  });

  it('has all expected variant keys', () => {
    const expectedKeys = [
      'draft', 'submitted', 'approved', 'in_service', 'closed',
      'pending', 'rejected', 'active', 'warning', 'error', 'success', 'info'
    ];
    for (const key of expectedKeys) {
      expect(BADGE_VARIANTS).toHaveProperty(key);
    }
  });

  it('every variant has bg-, text-, and border- classes', () => {
    for (const [variant, cls] of Object.entries(BADGE_VARIANTS)) {
      expect(cls.length).toBeGreaterThan(0);
      expect(cls).toMatch(/bg-/);
      expect(cls).toMatch(/text-/);
      expect(cls).toMatch(/border-/);
    }
  });

  it('draft variant has gray styling', () => {
    expect(BADGE_VARIANTS.draft).toContain('gray');
  });

  it('submitted variant has blue styling', () => {
    expect(BADGE_VARIANTS.submitted).toContain('blue');
  });

  it('approved variant has green styling', () => {
    expect(BADGE_VARIANTS.approved).toContain('green');
  });

  it('in_service variant has purple styling', () => {
    expect(BADGE_VARIANTS.in_service).toContain('purple');
  });

  it('pending variant has yellow styling', () => {
    expect(BADGE_VARIANTS.pending).toContain('yellow');
  });

  it('rejected variant has red styling', () => {
    expect(BADGE_VARIANTS.rejected).toContain('red');
  });
});

// ---------------------------------------------------------------------------
// Tests - getBadgeClass
// ---------------------------------------------------------------------------
describe('getBadgeClass', () => {
  it('returns correct class for known variants', () => {
    expect(getBadgeClass('draft')).toBe(BADGE_VARIANTS.draft);
    expect(getBadgeClass('submitted')).toBe(BADGE_VARIANTS.submitted);
    expect(getBadgeClass('approved')).toBe(BADGE_VARIANTS.approved);
    expect(getBadgeClass('in_service')).toBe(BADGE_VARIANTS.in_service);
    expect(getBadgeClass('closed')).toBe(BADGE_VARIANTS.closed);
    expect(getBadgeClass('pending')).toBe(BADGE_VARIANTS.pending);
    expect(getBadgeClass('rejected')).toBe(BADGE_VARIANTS.rejected);
    expect(getBadgeClass('active')).toBe(BADGE_VARIANTS.active);
    expect(getBadgeClass('warning')).toBe(BADGE_VARIANTS.warning);
    expect(getBadgeClass('error')).toBe(BADGE_VARIANTS.error);
    expect(getBadgeClass('success')).toBe(BADGE_VARIANTS.success);
    expect(getBadgeClass('info')).toBe(BADGE_VARIANTS.info);
  });

  it('falls back to info variant for unknown variant names', () => {
    expect(getBadgeClass('unknown_variant')).toBe(BADGE_VARIANTS.info);
    expect(getBadgeClass('')).toBe(BADGE_VARIANTS.info);
  });

  it('falls back to info variant for undefined', () => {
    expect(getBadgeClass(undefined)).toBe(BADGE_VARIANTS.info);
  });

  it('fallback class contains blue styling (info)', () => {
    const fallback = getBadgeClass('nonexistent');
    expect(fallback).toContain('blue');
  });
});
