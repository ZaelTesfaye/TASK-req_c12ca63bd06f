/**
 * Custom Error Classes
 *
 * Structured application errors with HTTP status codes and machine-readable codes.
 * Used throughout the application for consistent error handling.
 */

export class AppError extends Error {
  /**
   * @param {number} statusCode - HTTP status code
   * @param {string} code       - Machine-readable error code (e.g. 'NOT_FOUND')
   * @param {string} message    - Human-readable message
   * @param {*}      [details]  - Optional additional details
   */
  constructor(statusCode, code, message, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  /**
   * @param {string} resource - The resource type (e.g. 'User', 'Room')
   * @param {string|number} id - The identifier that was not found
   */
  constructor(resource, id) {
    super(404, 'NOT_FOUND', `${resource} with id '${id}' not found`, {
      resource,
      id,
    });
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  /**
   * @param {string} message - Description of the conflict
   * @param {*}      [details]
   */
  constructor(message, details = undefined) {
    super(409, 'CONFLICT', message, details);
    this.name = 'ConflictError';
  }
}

export class ValidationError extends AppError {
  /**
   * @param {Array} errors - Array of validation error objects
   */
  constructor(errors) {
    super(422, 'VALIDATION_ERROR', 'Validation failed', { errors });
    this.name = 'ValidationError';
  }
}

export class ForbiddenError extends AppError {
  /**
   * @param {string} [message]
   */
  constructor(message = 'Forbidden') {
    super(403, 'FORBIDDEN', message);
    this.name = 'ForbiddenError';
  }
}

export class UnauthorizedError extends AppError {
  /**
   * @param {string} [message]
   */
  constructor(message = 'Unauthorized') {
    super(401, 'UNAUTHORIZED', message);
    this.name = 'UnauthorizedError';
  }
}
