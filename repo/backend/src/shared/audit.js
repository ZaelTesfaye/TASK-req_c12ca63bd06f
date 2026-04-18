/**
 * Audit Trail Writer
 *
 * Inserts structured audit events into the `audit_trail` table.
 */

import db from '../db/connection.js';
import { createLogger } from '../logging/index.js';

const log = createLogger('audit');

/**
 * Write an audit trail entry.
 *
 * @param {object} params
 * @param {string}      params.eventId      - Unique event identifier (UUID)
 * @param {string}      params.subjectType  - Entity type being audited (e.g. 'user', 'room')
 * @param {string|number} params.subjectId  - Primary key of the audited entity
 * @param {string}      params.action       - Action performed (e.g. 'create', 'update', 'delete')
 * @param {string}      params.actorUserId  - The user performing the action
 * @param {object}      [params.before]     - Snapshot of the entity before the change
 * @param {object}      [params.after]      - Snapshot of the entity after the change
 * @param {string}      [params.notes]      - Optional free-text notes
 * @returns {Promise<void>}
 */
export async function writeAudit({
  eventId,
  subjectType,
  subjectId,
  action,
  actorUserId,
  before = null,
  after = null,
  notes = null,
}) {
  try {
    await db('audit_trail').insert({
      event_id: eventId,
      subject_type: subjectType,
      subject_id: String(subjectId),
      action,
      actor_user_id: actorUserId,
      before_json: before ? JSON.stringify(before) : null,
      after_json: after ? JSON.stringify(after) : null,
      notes,
      created_at: new Date(),
    });

    log.info(
      { action: 'write', eventId, subjectType, subjectId, auditAction: action },
      `Audit recorded: ${action} on ${subjectType} ${subjectId}`
    );
  } catch (err) {
    // Audit failures should not crash the application, but must be logged
    log.error(
      { action: 'write', err, eventId, subjectType, subjectId },
      'Failed to write audit trail entry'
    );
    throw err;
  }
}
