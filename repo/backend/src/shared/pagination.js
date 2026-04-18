/**
 * Pagination Helpers
 *
 * Utilities for parsing pagination parameters, applying them to Knex queries,
 * and formatting paginated API responses.
 */

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * Parse pagination parameters from a request query object.
 *
 * @param {object} query - The request query string object
 * @returns {{ page: number, pageSize: number, sortBy: string|undefined, sortDir: 'asc'|'desc' }}
 */
export function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);

  let pageSize = parseInt(query.pageSize, 10) || DEFAULT_PAGE_SIZE;
  pageSize = Math.max(1, Math.min(pageSize, MAX_PAGE_SIZE));

  const sortBy = query.sortBy || undefined;
  const sortDir =
    query.sortDir && query.sortDir.toLowerCase() === 'desc' ? 'desc' : 'asc';

  return { page, pageSize, sortBy, sortDir };
}

/**
 * Apply pagination (limit, offset, ordering) to a Knex query builder.
 *
 * @param {import('knex').Knex.QueryBuilder} knexQuery - The Knex query to modify
 * @param {object} opts
 * @param {number}   opts.page
 * @param {number}   opts.pageSize
 * @param {string}   [opts.sortBy]       - Column name to sort by
 * @param {'asc'|'desc'} [opts.sortDir]  - Sort direction
 * @param {string[]} [opts.allowedSorts] - Whitelist of allowed sort column names
 * @returns {import('knex').Knex.QueryBuilder}
 */
export function applyPagination(
  knexQuery,
  { page, pageSize, sortBy, sortDir, allowedSorts }
) {
  const offset = (page - 1) * pageSize;

  if (sortBy) {
    // Only apply sorting if the column is in the allowed list (when provided)
    if (!allowedSorts || allowedSorts.includes(sortBy)) {
      knexQuery = knexQuery.orderBy(sortBy, sortDir || 'asc');
    }
  }

  return knexQuery.limit(pageSize).offset(offset);
}

/**
 * Format a paginated API response envelope.
 *
 * @param {Array}  data  - The result rows for the current page
 * @param {number} total - Total number of matching rows across all pages
 * @param {object} opts
 * @param {number} opts.page
 * @param {number} opts.pageSize
 * @returns {{ data: Array, pagination: { page: number, pageSize: number, total: number, totalPages: number } }}
 */
export function formatPaginatedResponse(data, total, { page, pageSize }) {
  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}
