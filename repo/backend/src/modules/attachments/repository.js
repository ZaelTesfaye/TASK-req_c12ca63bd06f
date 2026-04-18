/**
 * Attachments Repository
 *
 * Database access layer for file attachment records.
 */

import db from '../../db/connection.js';
import { createLogger } from '../../logging/index.js';

const log = createLogger('attachments:repository');

/**
 * Create an attachment record.
 *
 * @param {object} data
 * @returns {Promise<object>} The inserted attachment
 */
export async function create(data) {
  log.info(
    { action: 'create', originalName: data.original_name },
    'Inserting attachment record',
  );

  const [attachment] = await db('attachments')
    .insert({
      event_id: data.event_id || null,
      recipe_version_id: data.recipe_version_id || null,
      original_name: data.original_name,
      mime_type: data.mime_type,
      size_bytes: data.size_bytes,
      sha256_hex: data.sha256_hex,
      storage_path: data.storage_path,
      variants_json: data.variants_json ? JSON.stringify(data.variants_json) : '{}',
      uploaded_by: data.uploaded_by,
    })
    .returning('*');

  return attachment;
}

/**
 * Find an attachment by ID.
 *
 * @param {string} id - UUID
 * @returns {Promise<object|null>}
 */
export async function findById(id) {
  log.debug({ action: 'findById', id }, 'Looking up attachment');

  return db('attachments').where({ id }).first();
}

/**
 * List attachments for a specific event.
 *
 * @param {string} eventId - UUID
 * @returns {Promise<object[]>}
 */
export async function findByEvent(eventId) {
  log.debug({ action: 'findByEvent', eventId }, 'Listing attachments for event');

  return db('attachments')
    .where({ event_id: eventId })
    .orderBy('created_at', 'desc');
}

/**
 * List attachments for a specific recipe version.
 *
 * @param {string} versionId - UUID
 * @returns {Promise<object[]>}
 */
export async function findByRecipeVersion(versionId) {
  log.debug({ action: 'findByRecipeVersion', versionId }, 'Listing attachments for recipe version');

  return db('attachments')
    .where({ recipe_version_id: versionId })
    .orderBy('created_at', 'desc');
}
