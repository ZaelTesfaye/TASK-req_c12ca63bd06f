/**
 * Shared validation functions for forms in the Hospitality Operations Management System.
 *
 * These validators are used by Svelte form components and can be tested independently.
 */

/**
 * Validate login form fields.
 * @param {object} fields
 * @param {string} [fields.username='']
 * @param {string} [fields.password='']
 * @returns {object} Map of field name to error message (empty if valid).
 */
export function validateLogin({ username = '', password = '' }) {
  const errors = {};
  if (!username.trim()) errors.username = 'Username is required';
  else if (username.length < 3) errors.username = 'Username must be at least 3 characters';
  if (!password) errors.password = 'Password is required';
  else if (password.length < 8) errors.password = 'Password must be at least 8 characters';
  return errors;
}

/**
 * Validate event creation/edit form fields.
 * @param {object} fields
 * @param {string} [fields.title='']
 * @param {string} [fields.eventDate='']
 * @param {number} [fields.headcount=1]
 * @param {number} [fields.budgetAmount=0]
 * @returns {object} Map of field name to error message (empty if valid).
 */
export function validateEvent({ title = '', eventDate = '', headcount = 1, budgetAmount = 0 }) {
  const errors = {};
  if (!title.trim()) errors.title = 'Title is required';
  if (!eventDate) errors.eventDate = 'Event date is required';
  if (!headcount || headcount < 1) errors.headcount = 'Headcount must be at least 1';
  if (budgetAmount < 0) errors.budgetAmount = 'Budget cannot be negative';
  return errors;
}

/**
 * Validate registration form fields.
 * @param {object} fields
 * @param {string} [fields.username='']
 * @param {string} [fields.password='']
 * @param {string} [fields.confirmPassword='']
 * @returns {object} Map of field name to error message (empty if valid).
 */
export function validateRegister({ username = '', password = '', confirmPassword = '' }) {
  const errors = {};
  if (!username.trim()) errors.username = 'Username is required';
  else if (username.length < 3) errors.username = 'Username must be at least 3 characters';
  else if (username.length > 100) errors.username = 'Username must be at most 100 characters';
  if (!password) errors.password = 'Password is required';
  else if (password.length < 8) errors.password = 'Password must be at least 8 characters';
  if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match';
  return errors;
}

/**
 * Validate a service window entry.
 * @param {object} window - The service window to validate.
 * @param {string} [window.label]
 * @param {string} [window.start_at]
 * @param {string} [window.end_at]
 * @param {Array} [existingWindows=[]] - Other windows (for overlap checks in the future).
 * @returns {object} Map of field name to error message (empty if valid).
 */
export function validateServiceWindow(window, existingWindows = []) {
  const errors = {};
  if (!window.label?.trim()) errors.label = 'Label is required';
  if (!window.start_at) errors.start_at = 'Start time is required';
  if (!window.end_at) errors.end_at = 'End time is required';
  if (window.start_at && window.end_at && new Date(window.start_at) >= new Date(window.end_at)) {
    errors.end_at = 'End time must be after start time';
  }
  return errors;
}
