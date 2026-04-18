/**
 * Unit tests for custom error classes.
 */

import {
  AppError,
  NotFoundError,
  ConflictError,
  ValidationError,
  ForbiddenError,
  UnauthorizedError,
} from '../../src/shared/errors.js';

describe('AppError', () => {
  it('has correct statusCode, code, and message', () => {
    const err = new AppError(500, 'INTERNAL', 'Something broke');

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL');
    expect(err.message).toBe('Something broke');
    expect(err.name).toBe('AppError');
  });

  it('stores optional details', () => {
    const details = { field: 'email', constraint: 'unique' };
    const err = new AppError(422, 'VALIDATION', 'Invalid', details);

    expect(err.details).toEqual(details);
  });

  it('defaults details to undefined when not provided', () => {
    const err = new AppError(400, 'BAD_REQUEST', 'Bad');

    expect(err.details).toBeUndefined();
  });
});

describe('NotFoundError', () => {
  it('is a 404 with NOT_FOUND code', () => {
    const err = new NotFoundError('User', '123');

    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.name).toBe('NotFoundError');
    expect(err.message).toBe("User with id '123' not found");
  });

  it('includes resource and id in details', () => {
    const err = new NotFoundError('Room', 'abc-uuid');

    expect(err.details).toEqual({ resource: 'Room', id: 'abc-uuid' });
  });
});

describe('ConflictError', () => {
  it('is a 409 with CONFLICT code', () => {
    const err = new ConflictError('Duplicate entry');

    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
    expect(err.name).toBe('ConflictError');
    expect(err.message).toBe('Duplicate entry');
  });

  it('passes through optional details', () => {
    const err = new ConflictError('Dup', { key: 'name' });

    expect(err.details).toEqual({ key: 'name' });
  });
});

describe('ValidationError', () => {
  it('is a 422 with VALIDATION_ERROR code', () => {
    const errors = [{ path: 'email', message: 'invalid' }];
    const err = new ValidationError(errors);

    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.name).toBe('ValidationError');
    expect(err.message).toBe('Validation failed');
    expect(err.details).toEqual({ errors });
  });
});

describe('ForbiddenError', () => {
  it('is a 403 with FORBIDDEN code', () => {
    const err = new ForbiddenError();

    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
    expect(err.name).toBe('ForbiddenError');
    expect(err.message).toBe('Forbidden');
  });

  it('accepts a custom message', () => {
    const err = new ForbiddenError('No access here');

    expect(err.message).toBe('No access here');
  });
});

describe('UnauthorizedError', () => {
  it('is a 401 with UNAUTHORIZED code', () => {
    const err = new UnauthorizedError();

    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.name).toBe('UnauthorizedError');
    expect(err.message).toBe('Unauthorized');
  });

  it('accepts a custom message', () => {
    const err = new UnauthorizedError('Token expired');

    expect(err.message).toBe('Token expired');
  });
});
