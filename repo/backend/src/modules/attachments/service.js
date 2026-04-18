/**
 * Attachments Service
 *
 * Business logic for file uploads, MIME validation, hashing, image variant
 * generation (via Sharp), and storage.
 */

import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createLogger } from '../../logging/index.js';
import config from '../../config/index.js';
import { writeAudit } from '../../shared/audit.js';
import { AppError } from '../../shared/errors.js';
import * as attachmentsRepo from './repository.js';

const log = createLogger('attachments:service');

/** MIME types considered images for variant generation. */
const IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
]);

/** Image variant definitions: suffix -> max edge size in px. */
const IMAGE_VARIANTS = {
  thumb: 200,
  preview: 600,
  full: 1200,
};

/**
 * Handle a file upload: validate, hash, store, generate image variants, persist record.
 *
 * @param {string} userId - Uploader's user UUID
 * @param {object} file - Multipart file object { filename, mimetype, data (Buffer) }
 * @param {object} refs - { eventId?, recipeVersionId? }
 * @returns {Promise<object>} Attachment record with upload status
 */
export async function upload(userId, file, refs = {}) {
  log.info(
    { action: 'upload', userId, filename: file.filename },
    'Processing file upload',
  );

  // 1. Validate MIME type
  if (!config.upload.allowedMime.includes(file.mimetype)) {
    throw new AppError(422, 'INVALID_MIME_TYPE', `MIME type '${file.mimetype}' is not allowed`, {
      allowed: config.upload.allowedMime,
      received: file.mimetype,
    });
  }

  // 2. Validate file size
  const maxBytes = config.upload.maxMb * 1024 * 1024;
  if (file.data.length > maxBytes) {
    throw new AppError(422, 'FILE_TOO_LARGE', `File exceeds maximum size of ${config.upload.maxMb}MB`, {
      maxMb: config.upload.maxMb,
      actualBytes: file.data.length,
    });
  }

  // 3. Compute SHA-256 hash
  const sha256Hex = createHash('sha256').update(file.data).digest('hex');

  // 4. Build storage path: {year}/{month}/{sha256}.{ext}
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const ext = extname(file.filename).replace(/^\./, '').toLowerCase() || 'bin';
  const relativePath = `${year}/${month}/${sha256Hex}.${ext}`;
  const absoluteDir = join(config.upload.root, year, month);
  const absolutePath = join(config.upload.root, relativePath);

  // Ensure directory exists
  await mkdir(absoluteDir, { recursive: true });

  // Write original file
  await writeFile(absolutePath, file.data);

  // 5. Generate image variants if applicable
  let variantsJson = {};
  if (IMAGE_MIMES.has(file.mimetype)) {
    try {
      // Dynamic import to avoid hard dependency if sharp isn't installed
      const sharp = (await import('sharp')).default;

      for (const [variantName, maxEdge] of Object.entries(IMAGE_VARIANTS)) {
        const variantFilename = `${sha256Hex}_${variantName}.${ext}`;
        const variantPath = join(absoluteDir, variantFilename);
        const variantRelative = `${year}/${month}/${variantFilename}`;

        await sharp(file.data)
          .resize(maxEdge, maxEdge, { fit: 'inside', withoutEnlargement: true })
          .toFile(variantPath);

        variantsJson[variantName] = variantRelative;
      }
    } catch (err) {
      // If sharp is unavailable, log and continue without variants
      log.warn(
        { action: 'upload', err: err.message },
        'Image variant generation failed — continuing without variants',
      );
      variantsJson = {};
    }
  }

  // 6. Create attachment record
  const attachment = await attachmentsRepo.create({
    event_id: refs.eventId || null,
    recipe_version_id: refs.recipeVersionId || null,
    original_name: file.filename,
    mime_type: file.mimetype,
    size_bytes: file.data.length,
    sha256_hex: sha256Hex,
    storage_path: relativePath,
    variants_json: variantsJson,
    uploaded_by: userId,
  });

  // 7. Write audit trail
  await writeAudit({
    eventId: refs.eventId || null,
    subjectType: 'attachment',
    subjectId: attachment.id,
    action: 'upload',
    actorUserId: userId,
    before: null,
    after: {
      id: attachment.id,
      original_name: file.filename,
      mime_type: file.mimetype,
      size_bytes: file.data.length,
      sha256_hex: sha256Hex,
    },
    notes: `Uploaded file '${file.filename}'`,
  });

  log.info(
    { action: 'upload', attachmentId: attachment.id, sha256: sha256Hex },
    'File upload completed',
  );

  // 8. Return attachment with upload status
  return {
    ...attachment,
    upload_status: 'success',
    variants: variantsJson,
  };
}
