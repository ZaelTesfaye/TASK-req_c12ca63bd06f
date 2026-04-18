/**
 * Unit tests for utility functions.
 * Source: src/lib/utils/index.js
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  formatDate,
  formatCurrency,
  debounce,
  classNames,
  maskField
} from '../../src/lib/utils/index.js';

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------
describe('formatDate', () => {
  it('returns a formatted date string for a valid Date object', () => {
    const result = formatDate(new Date('2025-06-15'));
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    // Default format is "medium": e.g. "Jun 15, 2025"
    expect(result).toContain('2025');
    expect(result).toContain('15');
  });

  it('returns a formatted date string for an ISO date string', () => {
    const result = formatDate('2025-01-01T12:00:00Z');
    expect(result).toBeTruthy();
    expect(result).toContain('2025');
  });

  it('returns empty string for null/undefined input', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('')).toBe('');
  });

  it('returns empty string for invalid dates', () => {
    expect(formatDate('not-a-date')).toBe('');
    expect(formatDate('abc123')).toBe('');
  });

  it('accepts format option "short"', () => {
    const result = formatDate('2025-06-15', { format: 'short' });
    expect(result).toBeTruthy();
  });

  it('accepts format option "long"', () => {
    const result = formatDate('2025-06-15', { format: 'long' });
    expect(result).toContain('June');
  });
});

// ---------------------------------------------------------------------------
// formatCurrency
// ---------------------------------------------------------------------------
describe('formatCurrency', () => {
  it('formats a positive dollar amount correctly', () => {
    const result = formatCurrency(1234.56);
    expect(result).toContain('1,234.56');
    // Should include dollar sign or USD
    expect(result).toMatch(/\$/);
  });

  it('formats 0 correctly', () => {
    const result = formatCurrency(0);
    expect(result).toContain('0.00');
  });

  it('formats negative amounts', () => {
    const result = formatCurrency(-50);
    expect(result).toContain('50.00');
  });

  it('returns empty string for null or NaN', () => {
    expect(formatCurrency(null)).toBe('');
    expect(formatCurrency(undefined)).toBe('');
    expect(formatCurrency(NaN)).toBe('');
  });

  it('formats with a different currency when specified', () => {
    const result = formatCurrency(100, 'EUR', 'de-DE');
    expect(result).toBeTruthy();
    // Should contain the amount
    expect(result).toContain('100');
  });
});

// ---------------------------------------------------------------------------
// debounce
// ---------------------------------------------------------------------------
describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('delays function call', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('only calls function once when invoked multiple times within delay', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);

    debounced('a');
    debounced('b');
    debounced('c');

    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('provides a cancel method', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);

    debounced();
    debounced.cancel();
    vi.advanceTimersByTime(300);

    expect(fn).not.toHaveBeenCalled();
  });

  it('uses default delay of 300ms when not specified', () => {
    const fn = vi.fn();
    const debounced = debounce(fn);

    debounced();
    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// classNames
// ---------------------------------------------------------------------------
describe('classNames', () => {
  it('joins plain strings', () => {
    expect(classNames('btn', 'btn-primary', 'ml-2')).toBe('btn btn-primary ml-2');
  });

  it('filters out falsy values', () => {
    expect(classNames('btn', null, undefined, false, '', 'active')).toBe('btn active');
  });

  it('handles objects with truthy/falsy values', () => {
    const result = classNames('btn', {
      'btn-primary': true,
      'btn-disabled': false,
      'btn-large': true
    });
    expect(result).toBe('btn btn-primary btn-large');
  });

  it('handles arrays', () => {
    const result = classNames('base', ['nested', 'classes']);
    expect(result).toBe('base nested classes');
  });

  it('handles mixed arguments', () => {
    const result = classNames(
      'a',
      { b: true, c: false },
      ['d', { e: true }],
      null,
      'f'
    );
    expect(result).toBe('a b d e f');
  });

  it('returns empty string when given no truthy args', () => {
    expect(classNames(null, false, undefined, '')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// maskField
// ---------------------------------------------------------------------------
describe('maskField', () => {
  it('masks email - shows first chars + *** + @domain', () => {
    const result = maskField('alice@example.com', { type: 'email' });
    // localPart "alice" => visible = min(2, 5) = 2 => "al" + mask + "@example.com"
    expect(result).toMatch(/^al\*+@example\.com$/);
    expect(result).toContain('@example.com');
    expect(result.startsWith('al')).toBe(true);
  });

  it('masks email with short local part', () => {
    const result = maskField('a@b.com', { type: 'email' });
    expect(result).toContain('@b.com');
  });

  it('masks phone - shows last 4 digits', () => {
    const result = maskField('(555) 123-4567', { type: 'phone' });
    // digits = "5551234567" (10 digits), mask 6 + show last 4 = "******4567"
    expect(result).toMatch(/^\*+4567$/);
    expect(result.endsWith('4567')).toBe(true);
  });

  it('masks phone with short number', () => {
    const result = maskField('12', { type: 'phone' });
    // Only 2 digits, less than 4, returns mask repeat
    expect(result).toBe('****');
  });

  it('masks default type - shows last 4 chars', () => {
    const result = maskField('my-secret-value');
    // length 15, visibleChars=4, maskLength = max(4, 15-4)=11
    expect(result.endsWith('alue')).toBe(true);
    expect(result).toMatch(/^\*+alue$/);
  });

  it('masks default for short strings', () => {
    const result = maskField('abc');
    // length 3 <= visibleChars(4), returns mask repeat
    expect(result).toBe('****');
  });

  it('returns empty string for null/undefined/non-string', () => {
    expect(maskField(null)).toBe('');
    expect(maskField(undefined)).toBe('');
    expect(maskField('')).toBe('');
    expect(maskField(12345)).toBe('');
  });

  it('masks card type - shows last 4 digits', () => {
    const result = maskField('4111-1111-1111-1234', { type: 'card' });
    expect(result.endsWith('1234')).toBe(true);
    expect(result).toMatch(/^\*+1234$/);
  });
});
