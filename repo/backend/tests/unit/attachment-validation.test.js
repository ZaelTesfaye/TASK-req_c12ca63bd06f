/**
 * Unit tests for attachment validation (MIME type, size, SHA-256 hashing).
 *
 * Tests the upload function from the attachments service which validates
 * files before storing them.
 */

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../src/config/index.js', () => ({
  default: {
    encryptionKeyHex: 'ab'.repeat(32),
    upload: {
      root: '/tmp/test-uploads',
      maxMb: 25,
      allowedMime: [
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/pdf',
      ],
    },
  },
  config: {
    upload: {
      root: '/tmp/test-uploads',
      maxMb: 25,
      allowedMime: [
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/pdf',
      ],
    },
  },
}));

vi.mock('../../src/db/connection.js', () => {
  const mockDb = vi.fn();
  mockDb.transaction = vi.fn();
  mockDb.raw = vi.fn();
  mockDb.fn = { now: vi.fn(() => 'NOW()') };
  return { default: mockDb, db: mockDb };
});

vi.mock('../../src/logging/index.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../src/shared/audit.js', () => ({
  writeAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/modules/attachments/repository.js', () => ({
  create: vi.fn().mockResolvedValue({
    id: 'att-1',
    original_name: 'test.pdf',
    mime_type: 'application/pdf',
    size_bytes: 1024,
    sha256_hex: 'abc123',
    storage_path: '2026/04/abc123.pdf',
  }),
}));

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

const { upload } = await import('../../src/modules/attachments/service.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(overrides = {}) {
  return {
    filename: 'document.pdf',
    mimetype: 'application/pdf',
    data: Buffer.from('test file content'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Attachment validation - upload()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Valid MIME types
  // -------------------------------------------------------------------------

  it('accepts application/pdf', async () => {
    const result = await upload('user-1', makeFile({ mimetype: 'application/pdf' }));

    expect(result.upload_status).toBe('success');
  });

  it('accepts image/png', async () => {
    const result = await upload('user-1', makeFile({
      filename: 'photo.png',
      mimetype: 'image/png',
    }));

    expect(result.upload_status).toBe('success');
  });

  it('accepts image/jpeg', async () => {
    const result = await upload('user-1', makeFile({
      filename: 'photo.jpg',
      mimetype: 'image/jpeg',
    }));

    expect(result.upload_status).toBe('success');
  });

  it('accepts image/webp', async () => {
    const result = await upload('user-1', makeFile({
      filename: 'photo.webp',
      mimetype: 'image/webp',
    }));

    expect(result.upload_status).toBe('success');
  });

  // -------------------------------------------------------------------------
  // Invalid MIME types
  // -------------------------------------------------------------------------

  it('rejects invalid MIME types', async () => {
    await expect(
      upload('user-1', makeFile({ mimetype: 'application/zip' }))
    ).rejects.toThrow(/MIME type.*not allowed/i);
  });

  it('rejects text/html MIME type', async () => {
    await expect(
      upload('user-1', makeFile({ mimetype: 'text/html' }))
    ).rejects.toThrow(/MIME type.*not allowed/i);
  });

  it('rejects application/javascript MIME type', async () => {
    await expect(
      upload('user-1', makeFile({ mimetype: 'application/javascript' }))
    ).rejects.toThrow(/MIME type.*not allowed/i);
  });

  // -------------------------------------------------------------------------
  // File size
  // -------------------------------------------------------------------------

  it('rejects file over 25MB', async () => {
    const largeData = Buffer.alloc(26 * 1024 * 1024); // 26 MB

    await expect(
      upload('user-1', makeFile({ data: largeData }))
    ).rejects.toThrow(/exceeds maximum size/i);
  });

  it('accepts file exactly at 25MB limit', async () => {
    const exactData = Buffer.alloc(25 * 1024 * 1024); // exactly 25 MB

    const result = await upload('user-1', makeFile({ data: exactData }));

    expect(result.upload_status).toBe('success');
  });

  // -------------------------------------------------------------------------
  // SHA-256 hash
  // -------------------------------------------------------------------------

  it('computes SHA-256 hash correctly', async () => {
    const content = 'hello world attachment content';
    const data = Buffer.from(content);
    const expectedHash = createHash('sha256').update(data).digest('hex');

    const { create } = await import('../../src/modules/attachments/repository.js');

    await upload('user-1', makeFile({ data }));

    // Verify the repository was called with the correct hash
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        sha256_hex: expectedHash,
      })
    );
  });

  // -------------------------------------------------------------------------
  // Error details
  // -------------------------------------------------------------------------

  it('includes error details for invalid MIME type', async () => {
    try {
      await upload('user-1', makeFile({ mimetype: 'video/mp4' }));
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.code).toBe('INVALID_MIME_TYPE');
      expect(err.statusCode).toBe(422);
      expect(err.details.received).toBe('video/mp4');
      expect(err.details.allowed).toContain('application/pdf');
    }
  });

  it('includes error details for oversized file', async () => {
    try {
      await upload('user-1', makeFile({ data: Buffer.alloc(30 * 1024 * 1024) }));
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.code).toBe('FILE_TOO_LARGE');
      expect(err.statusCode).toBe(422);
    }
  });
});
