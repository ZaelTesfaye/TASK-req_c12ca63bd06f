/**
 * Unit tests for the image processor plugin.
 */

vi.mock('sharp', () => {
  const mockSharpInstance = {
    resize: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    toBuffer: vi.fn(),
    metadata: vi.fn(),
  };

  const sharpFn = vi.fn(() => mockSharpInstance);
  sharpFn._instance = mockSharpInstance;

  return { default: sharpFn };
});

vi.mock('../../src/logging/index.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import sharp from 'sharp';
import {
  isImageMime,
  generateVariants,
  getImageMetadata,
} from '../../src/plugins/image-processor.js';

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// isImageMime
// ---------------------------------------------------------------------------

describe('isImageMime', () => {
  it('returns true for image/png', () => {
    expect(isImageMime('image/png')).toBe(true);
  });

  it('returns true for image/jpeg', () => {
    expect(isImageMime('image/jpeg')).toBe(true);
  });

  it('returns true for image/webp', () => {
    expect(isImageMime('image/webp')).toBe(true);
  });

  it('returns true for image/gif', () => {
    expect(isImageMime('image/gif')).toBe(true);
  });

  it('returns false for application/pdf', () => {
    expect(isImageMime('application/pdf')).toBe(false);
  });

  it('returns false for text/html', () => {
    expect(isImageMime('text/html')).toBe(false);
  });

  it('returns false for application/json', () => {
    expect(isImageMime('application/json')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// generateVariants
// ---------------------------------------------------------------------------

describe('generateVariants', () => {
  it('produces thumb, preview, and full variants', async () => {
    const fakeBuffer = Buffer.from('test-image');

    sharp._instance.toBuffer.mockResolvedValue({
      data: Buffer.from('processed'),
      info: { width: 150, height: 100, size: 1234 },
    });

    const result = await generateVariants(fakeBuffer, 'test.jpg');

    expect(result).toHaveProperty('thumb');
    expect(result).toHaveProperty('preview');
    expect(result).toHaveProperty('full');
  });

  it('each variant has buffer, width, height, size properties', async () => {
    const fakeBuffer = Buffer.from('test-image');

    sharp._instance.toBuffer.mockResolvedValue({
      data: Buffer.from('processed'),
      info: { width: 100, height: 80, size: 999 },
    });

    const result = await generateVariants(fakeBuffer, 'photo.png');

    for (const variant of ['thumb', 'preview', 'full']) {
      expect(result[variant]).toHaveProperty('buffer');
      expect(result[variant]).toHaveProperty('width');
      expect(result[variant]).toHaveProperty('height');
      expect(result[variant]).toHaveProperty('size');
      expect(Buffer.isBuffer(result[variant].buffer)).toBe(true);
    }
  });

  it('thumb variant dimensions are capped at 200px max edge', async () => {
    const fakeBuffer = Buffer.from('test');

    sharp._instance.toBuffer.mockResolvedValue({
      data: Buffer.from('thumb'),
      info: { width: 200, height: 133, size: 500 },
    });

    await generateVariants(fakeBuffer, 'big.jpg');

    // The first call to resize should be for thumb: 200x200
    const resizeCalls = sharp._instance.resize.mock.calls;
    expect(resizeCalls[0][0]).toBe(200);
    expect(resizeCalls[0][1]).toBe(200);
    expect(resizeCalls[0][2]).toEqual(
      expect.objectContaining({ fit: 'inside', withoutEnlargement: true }),
    );
  });

  it('preview variant dimensions are capped at 600px max edge', async () => {
    const fakeBuffer = Buffer.from('test');

    sharp._instance.toBuffer.mockResolvedValue({
      data: Buffer.from('preview'),
      info: { width: 600, height: 400, size: 2000 },
    });

    await generateVariants(fakeBuffer, 'big.jpg');

    // Second call to resize is for preview: 600x600
    const resizeCalls = sharp._instance.resize.mock.calls;
    expect(resizeCalls[1][0]).toBe(600);
    expect(resizeCalls[1][1]).toBe(600);
  });

  it('full variant dimensions are capped at 1200px max edge', async () => {
    const fakeBuffer = Buffer.from('test');

    sharp._instance.toBuffer.mockResolvedValue({
      data: Buffer.from('full'),
      info: { width: 1200, height: 800, size: 5000 },
    });

    await generateVariants(fakeBuffer, 'big.jpg');

    // Third call to resize is for full: 1200x1200
    const resizeCalls = sharp._instance.resize.mock.calls;
    expect(resizeCalls[2][0]).toBe(1200);
    expect(resizeCalls[2][1]).toBe(1200);
  });
});

// ---------------------------------------------------------------------------
// getImageMetadata
// ---------------------------------------------------------------------------

describe('getImageMetadata', () => {
  it('returns width, height, and format', async () => {
    sharp._instance.metadata.mockResolvedValue({
      width: 1920,
      height: 1080,
      format: 'jpeg',
      channels: 3,
      space: 'srgb',
    });

    const meta = await getImageMetadata(Buffer.from('img'));

    expect(meta).toEqual({
      width: 1920,
      height: 1080,
      format: 'jpeg',
    });
  });

  it('handles non-image input gracefully by propagating the sharp error', async () => {
    sharp._instance.metadata.mockRejectedValue(new Error('Input buffer contains unsupported image format'));

    await expect(getImageMetadata(Buffer.from('not-an-image')))
      .rejects.toThrow('Input buffer contains unsupported image format');
  });
});
