/**
 * Unit tests for pagination helpers.
 */

import { parsePagination, formatPaginatedResponse } from '../../src/shared/pagination.js';

describe('parsePagination', () => {
  it('extracts page, pageSize, sortBy, sortDir from query', () => {
    const result = parsePagination({
      page: '3',
      pageSize: '50',
      sortBy: 'title',
      sortDir: 'desc',
    });

    expect(result).toEqual({
      page: 3,
      pageSize: 50,
      sortBy: 'title',
      sortDir: 'desc',
    });
  });

  it('provides defaults when query params are missing', () => {
    const result = parsePagination({});

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.sortBy).toBeUndefined();
    expect(result.sortDir).toBe('asc');
  });

  it('caps pageSize at 100', () => {
    const result = parsePagination({ pageSize: '500' });

    expect(result.pageSize).toBe(100);
  });

  it('enforces minimum page of 1', () => {
    const result = parsePagination({ page: '-5' });

    expect(result.page).toBe(1);
  });

  it('enforces minimum pageSize of 1 (negative values become default)', () => {
    const result = parsePagination({ pageSize: '-5' });

    // Math.max(1, Math.min(-5, 100)) = Math.max(1, -5) = 1
    expect(result.pageSize).toBe(1);
  });

  it('pageSize of 0 falls back to default since parseInt returns 0 which is falsy', () => {
    const result = parsePagination({ pageSize: '0' });

    // parseInt('0', 10) is 0, `|| DEFAULT_PAGE_SIZE` gives 20, then Math.max(1, Math.min(20, 100)) = 20
    expect(result.pageSize).toBe(20);
  });

  it('defaults sortDir to asc when invalid value provided', () => {
    const result = parsePagination({ sortDir: 'random' });

    expect(result.sortDir).toBe('asc');
  });

  it('handles non-numeric page gracefully', () => {
    const result = parsePagination({ page: 'abc' });

    expect(result.page).toBe(1);
  });

  it('handles non-numeric pageSize gracefully', () => {
    const result = parsePagination({ pageSize: 'xyz' });

    expect(result.pageSize).toBe(20); // default
  });
});

describe('formatPaginatedResponse', () => {
  it('calculates totalPages correctly', () => {
    const data = [{ id: 1 }, { id: 2 }];
    const result = formatPaginatedResponse(data, 50, { page: 1, pageSize: 20 });

    expect(result).toEqual({
      data,
      pagination: {
        page: 1,
        pageSize: 20,
        total: 50,
        totalPages: 3, // ceil(50/20) = 3
      },
    });
  });

  it('returns totalPages of 0 when total is 0', () => {
    const result = formatPaginatedResponse([], 0, { page: 1, pageSize: 20 });

    expect(result.pagination.totalPages).toBe(0);
  });

  it('returns totalPages of 1 when total equals pageSize', () => {
    const result = formatPaginatedResponse([], 20, { page: 1, pageSize: 20 });

    expect(result.pagination.totalPages).toBe(1);
  });

  it('returns totalPages of 1 when total is less than pageSize', () => {
    const result = formatPaginatedResponse([], 5, { page: 1, pageSize: 20 });

    expect(result.pagination.totalPages).toBe(1);
  });

  it('preserves the data array as-is in the response', () => {
    const data = [{ id: 'a' }, { id: 'b' }];
    const result = formatPaginatedResponse(data, 2, { page: 1, pageSize: 10 });

    expect(result.data).toBe(data);
  });
});
