/**
 * Unit tests for the file validation utility module.
 * Source: src/lib/utils/file-validation.js
 *
 * Covers validateFile (MIME type + size checks), formatFileSize,
 * and isImageType.
 */
import { describe, it, expect } from 'vitest';
import { validateFile, formatFileSize, isImageType } from '../../src/lib/utils/file-validation.js';

// ---------------------------------------------------------------------------
// Helper to create a file-like object
// ---------------------------------------------------------------------------
function fakeFile(size, type) {
  return { size, type };
}

const MB = 1024 * 1024;

// ---------------------------------------------------------------------------
// validateFile – MIME type acceptance
// ---------------------------------------------------------------------------
describe('validateFile – MIME type acceptance', () => {
  it('accepts application/pdf', () => {
    expect(validateFile(fakeFile(1000, 'application/pdf'))).toEqual([]);
  });

  it('accepts application/vnd.openxmlformats-officedocument.wordprocessingml.document (DOCX)', () => {
    expect(validateFile(fakeFile(1000, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))).toEqual([]);
  });

  it('accepts application/vnd.openxmlformats-officedocument.spreadsheetml.sheet (XLSX)', () => {
    expect(validateFile(fakeFile(1000, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))).toEqual([]);
  });

  it('accepts image/png', () => {
    expect(validateFile(fakeFile(1000, 'image/png'))).toEqual([]);
  });

  it('accepts image/jpeg', () => {
    expect(validateFile(fakeFile(1000, 'image/jpeg'))).toEqual([]);
  });

  it('accepts image/gif', () => {
    expect(validateFile(fakeFile(1000, 'image/gif'))).toEqual([]);
  });

  it('accepts image/webp', () => {
    expect(validateFile(fakeFile(1000, 'image/webp'))).toEqual([]);
  });

  it('rejects application/zip', () => {
    const errors = validateFile(fakeFile(1000, 'application/zip'));
    expect(errors).toContain('File type not allowed');
  });

  it('rejects application/x-msdownload (EXE)', () => {
    const errors = validateFile(fakeFile(1000, 'application/x-msdownload'));
    expect(errors).toContain('File type not allowed');
  });

  it('rejects text/html', () => {
    const errors = validateFile(fakeFile(1000, 'text/html'));
    expect(errors).toContain('File type not allowed');
  });

  it('rejects application/javascript', () => {
    const errors = validateFile(fakeFile(1000, 'application/javascript'));
    expect(errors).toContain('File type not allowed');
  });

  it('rejects empty MIME type string', () => {
    const errors = validateFile(fakeFile(1000, ''));
    expect(errors).toContain('File type not allowed');
  });
});

// ---------------------------------------------------------------------------
// validateFile – size limits
// ---------------------------------------------------------------------------
describe('validateFile – size limits', () => {
  it('passes a file at exactly 25 MB', () => {
    expect(validateFile(fakeFile(25 * MB, 'application/pdf'))).toEqual([]);
  });

  it('rejects a file one byte over 25 MB', () => {
    const errors = validateFile(fakeFile(25 * MB + 1, 'application/pdf'));
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('25MB');
  });

  it('passes a very small file', () => {
    expect(validateFile(fakeFile(1, 'image/png'))).toEqual([]);
  });

  it('returns both errors when file is too large AND wrong type', () => {
    const errors = validateFile(fakeFile(26 * MB, 'application/zip'));
    expect(errors.length).toBe(2);
    expect(errors[0]).toContain('25MB');
    expect(errors[1]).toBe('File type not allowed');
  });

  it('respects custom maxSize option', () => {
    const errors = validateFile(fakeFile(6 * MB, 'application/pdf'), { maxSize: 5 * MB });
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('5MB');
  });

  it('respects custom allowedTypes option', () => {
    const errors = validateFile(fakeFile(100, 'text/plain'), { allowedTypes: ['text/plain'] });
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// formatFileSize
// ---------------------------------------------------------------------------
describe('formatFileSize', () => {
  it('formats bytes below 1 KB', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('formats 0 bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('formats exactly 1 KB', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(2.5 * MB)).toBe('2.5 MB');
  });

  it('formats exactly 1 MB', () => {
    expect(formatFileSize(MB)).toBe('1.0 MB');
  });

  it('formats large megabyte values', () => {
    expect(formatFileSize(25 * MB)).toBe('25.0 MB');
  });
});

// ---------------------------------------------------------------------------
// isImageType
// ---------------------------------------------------------------------------
describe('isImageType', () => {
  it('returns true for image/png', () => {
    expect(isImageType('image/png')).toBe(true);
  });

  it('returns true for image/jpeg', () => {
    expect(isImageType('image/jpeg')).toBe(true);
  });

  it('returns true for image/webp', () => {
    expect(isImageType('image/webp')).toBe(true);
  });

  it('returns true for image/gif', () => {
    expect(isImageType('image/gif')).toBe(true);
  });

  it('returns false for application/pdf', () => {
    expect(isImageType('application/pdf')).toBe(false);
  });

  it('returns false for text/html', () => {
    expect(isImageType('text/html')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isImageType(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isImageType(undefined)).toBe(false);
  });
});
