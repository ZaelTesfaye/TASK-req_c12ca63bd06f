/**
 * UI helper functions for the Hospitality Operations Management System.
 *
 * Provides pure functions for determining UI states and component variants,
 * extracted from Svelte components for reuse and testability.
 */

/**
 * Determine the UI state to render based on loading, error, and data.
 * This pattern is used across event lists, dashboard, and other data pages.
 *
 * @param {object} params
 * @param {boolean} params.loading - Whether data is currently loading.
 * @param {any} params.error - Error value (truthy = error state).
 * @param {any} params.data - The loaded data.
 * @returns {'loading'|'error'|'empty'|'success'} The UI state.
 */
export function getUIState({ loading, error, data }) {
  if (loading) return 'loading';
  if (error) return 'error';
  if (!data || (Array.isArray(data) && data.length === 0)) return 'empty';
  return 'success';
}

/**
 * Badge variant CSS class mappings.
 * Keys correspond to status/variant names used throughout the application.
 */
export const BADGE_VARIANTS = {
  draft: 'bg-gray-100 text-gray-700 border-gray-300',
  submitted: 'bg-blue-50 text-blue-700 border-blue-300',
  approved: 'bg-green-50 text-green-700 border-green-300',
  in_service: 'bg-purple-50 text-purple-700 border-purple-300',
  closed: 'bg-gray-100 text-gray-600 border-gray-400',
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-300',
  rejected: 'bg-red-50 text-red-700 border-red-300',
  active: 'bg-green-50 text-green-700 border-green-300',
  warning: 'bg-yellow-50 text-yellow-700 border-yellow-300',
  error: 'bg-red-50 text-red-700 border-red-300',
  success: 'bg-green-50 text-green-700 border-green-300',
  info: 'bg-blue-50 text-blue-700 border-blue-300',
};

/**
 * Get the CSS class string for a badge variant.
 * Falls back to the 'info' variant for unknown values.
 *
 * @param {string} variant - The badge variant name.
 * @returns {string} CSS class string.
 */
export function getBadgeClass(variant) {
  return BADGE_VARIANTS[variant] || BADGE_VARIANTS.info;
}
