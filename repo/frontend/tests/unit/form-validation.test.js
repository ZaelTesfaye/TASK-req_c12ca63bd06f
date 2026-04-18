/**
 * Unit tests for form validation logic.
 *
 * Tests the shared validators module (src/lib/utils/validators.js) which
 * contains the validation rules used by login, event-creation, registration,
 * and service-window forms.
 */
import { describe, it, expect } from 'vitest';
import {
  validateLogin,
  validateEvent,
  validateRegister,
  validateServiceWindow
} from '../../src/lib/utils/validators.js';

// ---------------------------------------------------------------------------
// Tests - Login validation
// ---------------------------------------------------------------------------
describe('validateLogin', () => {
  it('produces error when username is empty', () => {
    const errors = validateLogin({ username: '', password: 'password123' });
    expect(errors.username).toBeDefined();
    expect(errors.username).toContain('required');
  });

  it('produces error when username has only whitespace', () => {
    const errors = validateLogin({ username: '   ', password: 'password123' });
    expect(errors.username).toBeDefined();
    expect(errors.username).toContain('required');
  });

  it('produces error when username is less than 3 characters', () => {
    const errors = validateLogin({ username: 'ab', password: 'password123' });
    expect(errors.username).toContain('at least 3');
  });

  it('accepts username with exactly 3 characters', () => {
    const errors = validateLogin({ username: 'abc', password: 'password123' });
    expect(errors.username).toBeUndefined();
  });

  it('produces error when password is empty', () => {
    const errors = validateLogin({ username: 'testuser', password: '' });
    expect(errors.password).toBeDefined();
    expect(errors.password).toContain('required');
  });

  it('produces error when password is less than 8 characters', () => {
    const errors = validateLogin({ username: 'testuser', password: '1234567' });
    expect(errors.password).toContain('at least 8');
  });

  it('accepts password with exactly 8 characters', () => {
    const errors = validateLogin({ username: 'testuser', password: '12345678' });
    expect(errors.password).toBeUndefined();
  });

  it('returns no errors for valid inputs', () => {
    const errors = validateLogin({ username: 'admin', password: 'securepassword' });
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('returns multiple errors when both fields are invalid', () => {
    const errors = validateLogin({ username: '', password: '' });
    expect(errors.username).toBeDefined();
    expect(errors.password).toBeDefined();
  });

  it('uses defaults when called with empty object', () => {
    const errors = validateLogin({});
    expect(errors.username).toBeDefined();
    expect(errors.password).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Tests - Event creation validation
// ---------------------------------------------------------------------------
describe('validateEvent', () => {
  it('produces error when title is empty', () => {
    const errors = validateEvent({ title: '' });
    expect(errors.title).toBeDefined();
    expect(errors.title).toContain('required');
  });

  it('produces error when title is only whitespace', () => {
    const errors = validateEvent({ title: '   ', eventDate: '2025-06-15' });
    expect(errors.title).toBeDefined();
  });

  it('produces error when event date is empty', () => {
    const errors = validateEvent({ title: 'Gala', eventDate: '' });
    expect(errors.eventDate).toBeDefined();
  });

  it('produces error when headcount is 0', () => {
    const errors = validateEvent({ title: 'Gala', eventDate: '2025-06-15', headcount: 0 });
    expect(errors.headcount).toBeDefined();
    expect(errors.headcount).toContain('at least 1');
  });

  it('produces error when headcount is negative', () => {
    const errors = validateEvent({ title: 'Gala', eventDate: '2025-06-15', headcount: -5 });
    expect(errors.headcount).toBeDefined();
  });

  it('accepts headcount of 1', () => {
    const errors = validateEvent({ title: 'Gala', eventDate: '2025-06-15', headcount: 1 });
    expect(errors.headcount).toBeUndefined();
  });

  it('accepts large headcount', () => {
    const errors = validateEvent({ title: 'Gala', eventDate: '2025-06-15', headcount: 10000 });
    expect(errors.headcount).toBeUndefined();
  });

  it('produces error when budget is negative', () => {
    const errors = validateEvent({
      title: 'Gala',
      eventDate: '2025-06-15',
      headcount: 50,
      budgetAmount: -100
    });
    expect(errors.budgetAmount).toBeDefined();
    expect(errors.budgetAmount).toContain('negative');
  });

  it('accepts zero budget', () => {
    const errors = validateEvent({
      title: 'Gala',
      eventDate: '2025-06-15',
      headcount: 50,
      budgetAmount: 0
    });
    expect(errors.budgetAmount).toBeUndefined();
  });

  it('returns no errors for valid event data', () => {
    const errors = validateEvent({
      title: 'Annual Gala',
      eventDate: '2025-12-31',
      headcount: 200,
      budgetAmount: 15000
    });
    expect(Object.keys(errors)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests - Registration validation
// ---------------------------------------------------------------------------
describe('validateRegister', () => {
  it('produces error when username is empty', () => {
    const errors = validateRegister({ username: '', password: 'password123', confirmPassword: 'password123' });
    expect(errors.username).toBeDefined();
    expect(errors.username).toContain('required');
  });

  it('produces error when username is less than 3 characters', () => {
    const errors = validateRegister({ username: 'ab', password: 'password123', confirmPassword: 'password123' });
    expect(errors.username).toContain('at least 3');
  });

  it('produces error when username exceeds 100 characters', () => {
    const longName = 'a'.repeat(101);
    const errors = validateRegister({ username: longName, password: 'password123', confirmPassword: 'password123' });
    expect(errors.username).toContain('at most 100');
  });

  it('accepts username at exactly 100 characters', () => {
    const name100 = 'a'.repeat(100);
    const errors = validateRegister({ username: name100, password: 'password123', confirmPassword: 'password123' });
    expect(errors.username).toBeUndefined();
  });

  it('produces error when password is empty', () => {
    const errors = validateRegister({ username: 'testuser', password: '', confirmPassword: '' });
    expect(errors.password).toBeDefined();
    expect(errors.password).toContain('required');
  });

  it('produces error when password is less than 8 characters', () => {
    const errors = validateRegister({ username: 'testuser', password: 'short', confirmPassword: 'short' });
    expect(errors.password).toContain('at least 8');
  });

  it('produces error when passwords do not match', () => {
    const errors = validateRegister({ username: 'testuser', password: 'password123', confirmPassword: 'different456' });
    expect(errors.confirmPassword).toBeDefined();
    expect(errors.confirmPassword).toContain('do not match');
  });

  it('returns no confirmPassword error when passwords match', () => {
    const errors = validateRegister({ username: 'testuser', password: 'password123', confirmPassword: 'password123' });
    expect(errors.confirmPassword).toBeUndefined();
  });

  it('returns no errors for fully valid registration', () => {
    const errors = validateRegister({ username: 'newuser', password: 'securepass1', confirmPassword: 'securepass1' });
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('can return multiple errors simultaneously', () => {
    const errors = validateRegister({ username: '', password: '', confirmPassword: 'x' });
    expect(errors.username).toBeDefined();
    expect(errors.password).toBeDefined();
    expect(errors.confirmPassword).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Tests - Service window validation
// ---------------------------------------------------------------------------
describe('validateServiceWindow', () => {
  it('produces error when label is empty', () => {
    const errors = validateServiceWindow({ label: '', start_at: '2025-06-15T08:00', end_at: '2025-06-15T10:00' });
    expect(errors.label).toBeDefined();
    expect(errors.label).toContain('required');
  });

  it('produces error when label is null/undefined', () => {
    const errors = validateServiceWindow({ start_at: '2025-06-15T08:00', end_at: '2025-06-15T10:00' });
    expect(errors.label).toBeDefined();
  });

  it('produces error when label is only whitespace', () => {
    const errors = validateServiceWindow({ label: '   ', start_at: '2025-06-15T08:00', end_at: '2025-06-15T10:00' });
    expect(errors.label).toBeDefined();
  });

  it('produces error when start_at is missing', () => {
    const errors = validateServiceWindow({ label: 'Breakfast', start_at: '', end_at: '2025-06-15T10:00' });
    expect(errors.start_at).toBeDefined();
    expect(errors.start_at).toContain('Start time');
  });

  it('produces error when end_at is missing', () => {
    const errors = validateServiceWindow({ label: 'Breakfast', start_at: '2025-06-15T08:00', end_at: '' });
    expect(errors.end_at).toBeDefined();
    expect(errors.end_at).toContain('End time');
  });

  it('produces error when end time is before start time', () => {
    const errors = validateServiceWindow({
      label: 'Breakfast',
      start_at: '2025-06-15T10:00',
      end_at: '2025-06-15T08:00'
    });
    expect(errors.end_at).toBeDefined();
    expect(errors.end_at).toContain('after start time');
  });

  it('produces error when end time equals start time', () => {
    const errors = validateServiceWindow({
      label: 'Breakfast',
      start_at: '2025-06-15T10:00',
      end_at: '2025-06-15T10:00'
    });
    expect(errors.end_at).toBeDefined();
    expect(errors.end_at).toContain('after start time');
  });

  it('returns no errors for valid service window', () => {
    const errors = validateServiceWindow({
      label: 'Breakfast Service',
      start_at: '2025-06-15T07:00',
      end_at: '2025-06-15T10:00'
    });
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('accepts an optional existingWindows parameter without error', () => {
    const existing = [{ label: 'Lunch', start_at: '2025-06-15T12:00', end_at: '2025-06-15T14:00' }];
    const errors = validateServiceWindow(
      { label: 'Dinner', start_at: '2025-06-15T18:00', end_at: '2025-06-15T21:00' },
      existing
    );
    expect(Object.keys(errors)).toHaveLength(0);
  });
});
