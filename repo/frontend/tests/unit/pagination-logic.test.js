/**
 * Unit tests for the pagination utility module.
 * Source: src/lib/utils/pagination.js
 *
 * Tests computePagination (range math, boundary flags) and generatePageNumbers
 * (page array generation with ellipsis collapsing).
 */
import { describe, it, expect } from 'vitest';
import { computePagination, generatePageNumbers } from '../../src/lib/utils/pagination.js';

// ---------------------------------------------------------------------------
// computePagination
// ---------------------------------------------------------------------------
describe('computePagination', () => {
  it('page 1 of 100 items with pageSize 20 produces totalPages 5, showing "1 to 20 of 100"', () => {
    const result = computePagination(1, 20, 100);
    expect(result.totalPages).toBe(5);
    expect(result.start).toBe(1);
    expect(result.end).toBe(20);
    expect(result.hasPrevious).toBe(false);
    expect(result.hasNext).toBe(true);
  });

  it('page 3 of 25 items with pageSize 10 produces totalPages 3, showing "21 to 25 of 25"', () => {
    const result = computePagination(3, 10, 25);
    expect(result.totalPages).toBe(3);
    expect(result.start).toBe(21);
    expect(result.end).toBe(25);
    expect(result.hasPrevious).toBe(true);
    expect(result.hasNext).toBe(false);
  });

  it('zero total items produces totalPages 0, showing "0 to 0 of 0"', () => {
    const result = computePagination(1, 20, 0);
    expect(result.totalPages).toBe(0);
    expect(result.start).toBe(0);
    expect(result.end).toBe(0);
    expect(result.hasPrevious).toBe(false);
    expect(result.hasNext).toBe(false);
  });

  it('previous button is disabled on page 1', () => {
    expect(computePagination(1, 10, 50).hasPrevious).toBe(false);
  });

  it('next button is disabled on the last page', () => {
    expect(computePagination(5, 10, 50).hasNext).toBe(false);
  });

  it('both hasPrevious and hasNext are true on a middle page', () => {
    const result = computePagination(3, 10, 50);
    expect(result.hasPrevious).toBe(true);
    expect(result.hasNext).toBe(true);
  });

  it('a single item still reports totalPages 1', () => {
    const result = computePagination(1, 10, 1);
    expect(result.totalPages).toBe(1);
    expect(result.start).toBe(1);
    expect(result.end).toBe(1);
  });

  it('total exactly equal to pageSize reports totalPages 1', () => {
    const result = computePagination(1, 25, 25);
    expect(result.totalPages).toBe(1);
    expect(result.start).toBe(1);
    expect(result.end).toBe(25);
    expect(result.hasNext).toBe(false);
  });

  it('end value is clamped to total on the last page', () => {
    // 13 items, pageSize 5 => page 3 shows items 11-13
    const result = computePagination(3, 5, 13);
    expect(result.end).toBe(13);
    expect(result.start).toBe(11);
  });

  it('page 2 of 2 pages has previous but no next', () => {
    const result = computePagination(2, 10, 20);
    expect(result.hasPrevious).toBe(true);
    expect(result.hasNext).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// generatePageNumbers
// ---------------------------------------------------------------------------
describe('generatePageNumbers', () => {
  it('returns sequential numbers when totalPages fits within maxVisible', () => {
    expect(generatePageNumbers(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('returns a single page for totalPages = 1', () => {
    expect(generatePageNumbers(1, 1)).toEqual([1]);
  });

  it('returns empty array when totalPages is 0', () => {
    expect(generatePageNumbers(1, 0)).toEqual([]);
  });

  it('includes ellipsis when totalPages exceeds maxVisible and current page is in the middle', () => {
    const pages = generatePageNumbers(5, 10);
    expect(pages[0]).toBe(1);
    expect(pages).toContain('...');
    expect(pages[pages.length - 1]).toBe(10);
    expect(pages).toContain(5);
  });

  it('starts with [1, 2, 3, ...] when current page is near the beginning', () => {
    const pages = generatePageNumbers(2, 10);
    expect(pages[0]).toBe(1);
    expect(pages).toContain(2);
    expect(pages).toContain(3);
    expect(pages[pages.length - 1]).toBe(10);
  });

  it('ends with [..., n-1, n] when current page is near the end', () => {
    const pages = generatePageNumbers(9, 10);
    expect(pages[0]).toBe(1);
    expect(pages).toContain(9);
    expect(pages).toContain(10);
  });

  it('always includes the first and last page', () => {
    for (const current of [1, 5, 10, 15, 20]) {
      const pages = generatePageNumbers(current, 20);
      expect(pages[0]).toBe(1);
      expect(pages[pages.length - 1]).toBe(20);
    }
  });

  it('respects custom maxVisible parameter', () => {
    // With maxVisible = 3, any totalPages > 3 should collapse
    const pages = generatePageNumbers(3, 10, 3);
    expect(pages[0]).toBe(1);
    expect(pages[pages.length - 1]).toBe(10);
    expect(pages.length).toBeLessThanOrEqual(7); // 1, ..., 2, 3, 4, ..., 10
  });

  it('does not produce duplicate page numbers', () => {
    for (const current of [1, 2, 5, 9, 10]) {
      const pages = generatePageNumbers(current, 10);
      const numeric = pages.filter(p => typeof p === 'number');
      expect(new Set(numeric).size).toBe(numeric.length);
    }
  });

  it('returns all pages when totalPages equals maxVisible exactly', () => {
    expect(generatePageNumbers(4, 7, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});
