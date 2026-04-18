/**
 * Report download helpers.
 *
 * Reports are served as `text/csv` from authenticated GET endpoints. We can't
 * use `window.open` because it drops the Bearer token and hits the backend
 * anonymously, causing a 401. Instead, fetch through the authenticated API
 * client, wrap the CSV body in a Blob, and trigger a client-side download.
 */

import { get } from './client.js';

/**
 * Fetch a CSV report through the authenticated API client and trigger a
 * browser download with the given filename.
 *
 * @param {string} path - API path including query string (e.g. '/reports/events/export?from_date=...')
 * @param {string} filename - Suggested filename for the saved file
 * @returns {Promise<{ status: number, message: string }|null>} Error object on failure, null on success
 */
export async function downloadReport(path, filename) {
  const { data, error } = await get(path);
  if (error) return error;

  // The backend sends text/csv, so the client returns a string.
  // A few endpoints wrap the payload as { data: '<csv>' }; handle both shapes.
  const csv = typeof data === 'string' ? data : data?.data ?? data?.csv ?? null;
  if (!csv) return { status: 0, message: 'Export returned no CSV data' };

  if (typeof window === 'undefined') return null;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return null;
}
