/**
 * File validation utilities for the Hospitality Operations Management System.
 *
 * Extracted from FileUpload.svelte so the validation rules can be tested
 * independently and reused in other upload flows.
 */

/** Maximum upload size in bytes (25 MB). */
const DEFAULT_MAX_SIZE = 25 * 1024 * 1024;

/** MIME types accepted by the application. */
const DEFAULT_ALLOWED_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp'
];

/**
 * Validate a file against size and MIME-type constraints.
 *
 * @param {{ size: number, type: string }} file - File-like object to validate.
 * @param {object} [options]
 * @param {number} [options.maxSize] - Maximum allowed size in bytes.
 * @param {string[]} [options.allowedTypes] - Array of accepted MIME type strings.
 * @returns {string[]} Array of error messages (empty when valid).
 */
export function validateFile(file, { maxSize = DEFAULT_MAX_SIZE, allowedTypes = DEFAULT_ALLOWED_MIME } = {}) {
  const errors = [];
  if (file.size > maxSize) errors.push(`File exceeds ${(maxSize / (1024 * 1024)).toFixed(0)}MB limit`);
  if (!allowedTypes.includes(file.type)) errors.push('File type not allowed');
  return errors;
}

/**
 * Format a byte count into a human-readable size string.
 *
 * @param {number} bytes - Number of bytes.
 * @returns {string} Formatted size string (e.g. "1.5 MB").
 */
export function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Check whether a MIME type represents an image.
 *
 * @param {string} mimeType - The MIME type string to check.
 * @returns {boolean} True when the MIME type starts with "image/".
 */
export function isImageType(mimeType) {
  return mimeType?.startsWith('image/') ?? false;
}
