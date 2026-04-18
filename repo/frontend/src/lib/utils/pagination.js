/**
 * Pagination logic for the Hospitality Operations Management System.
 *
 * Extracted from Pagination.svelte so the math can be tested independently
 * and reused across components that need pagination calculations.
 */

/**
 * Compute pagination metadata from the current page, page size, and total count.
 *
 * @param {number} page - Current 1-based page number.
 * @param {number} pageSize - Number of items per page.
 * @param {number} total - Total number of items across all pages.
 * @returns {{ totalPages: number, start: number, end: number, hasPrevious: boolean, hasNext: boolean }}
 */
export function computePagination(page, pageSize, total) {
  const totalPages = Math.max(0, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const hasPrevious = page > 1;
  const hasNext = page < totalPages;
  return { totalPages, start, end, hasPrevious, hasNext };
}

/**
 * Generate an array of page numbers (and ellipsis markers) for a pagination control.
 *
 * Always includes the first and last page.  Inserts '...' when there are gaps.
 *
 * @param {number} currentPage - The currently active page (1-based).
 * @param {number} totalPages - Total number of pages.
 * @param {number} [maxVisible=7] - Maximum number of page buttons to show before collapsing.
 * @returns {Array<number|string>} Page numbers with '...' for collapsed ranges.
 */
export function generatePageNumbers(currentPage, totalPages, maxVisible = 7) {
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = [1];

  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) pages.push('...');
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < totalPages - 1) pages.push('...');
  if (totalPages > 1) pages.push(totalPages);

  return pages;
}
