/**
 * Image Processor Plugin
 *
 * Provides image processing utilities using Sharp:
 *  - Generate thumbnail, preview, and full-size variants
 *  - MIME type validation
 *  - Metadata extraction
 */

import sharp from 'sharp';
import { createLogger } from '../logging/index.js';

const log = createLogger('image-processor');

// ---------------------------------------------------------------------------
// Supported MIME types
// ---------------------------------------------------------------------------

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/tiff',
  'image/avif',
  'image/svg+xml',
]);

// ---------------------------------------------------------------------------
// Variant configurations
// ---------------------------------------------------------------------------

const VARIANTS = {
  thumb: { width: 200, height: 200, quality: 80 },
  preview: { width: 600, height: 600, quality: 85 },
  full: { width: 1200, height: 1200, quality: 90 },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate thumbnail, preview, and full-size variants from a source image buffer.
 *
 * Each variant is resized to fit within its maximum dimensions while preserving
 * the original aspect ratio. Output format is JPEG.
 *
 * @param {Buffer} inputBuffer  - Raw image buffer
 * @param {string} originalName - Original filename (used for logging)
 * @returns {Promise<{
 *   thumb:   { buffer: Buffer, width: number, height: number, size: number },
 *   preview: { buffer: Buffer, width: number, height: number, size: number },
 *   full:    { buffer: Buffer, width: number, height: number, size: number },
 * }>}
 */
export async function generateVariants(inputBuffer, originalName) {
  log.info(
    { action: 'generateVariants', originalName },
    `[image-processor][generateVariants] Generating variants for ${originalName}`,
  );

  const results = {};

  for (const [variantName, cfg] of Object.entries(VARIANTS)) {
    const processed = await sharp(inputBuffer)
      .resize(cfg.width, cfg.height, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: cfg.quality })
      .toBuffer({ resolveWithObject: true });

    results[variantName] = {
      buffer: processed.data,
      width: processed.info.width,
      height: processed.info.height,
      size: processed.info.size,
    };

    log.debug(
      {
        action: 'variant',
        variant: variantName,
        width: processed.info.width,
        height: processed.info.height,
        size: processed.info.size,
      },
      `[image-processor][variant] ${variantName}: ${processed.info.width}x${processed.info.height} (${processed.info.size} bytes)`,
    );
  }

  log.info(
    { action: 'generateVariants:complete', originalName },
    `[image-processor][generateVariants] Variants generated for ${originalName}`,
  );

  return results;
}

/**
 * Check whether a MIME type corresponds to a supported image format.
 *
 * @param {string} mimeType
 * @returns {boolean}
 */
export function isImageMime(mimeType) {
  return IMAGE_MIME_TYPES.has(mimeType);
}

/**
 * Extract basic metadata (width, height, format) from an image buffer.
 *
 * @param {Buffer} buffer
 * @returns {Promise<{ width: number, height: number, format: string }>}
 */
export async function getImageMetadata(buffer) {
  const metadata = await sharp(buffer).metadata();

  return {
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
  };
}
