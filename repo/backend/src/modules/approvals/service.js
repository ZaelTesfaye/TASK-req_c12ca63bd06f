/**
 * Approvals Service
 *
 * Business logic layer for approval operations, including
 * dual-approval flows, side effects, and audit trail recording.
 */

import { createLogger } from '../../logging/index.js';
import { writeAudit } from '../../shared/audit.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../../shared/errors.js';
import * as approvalsRepo from './repository.js';
import db from '../../db/connection.js';

const log = createLogger('approvals:service');

/**
 * Create a new approval record with audit trail.
 *
 * @param {object} data - { event_id, approval_type, requested_by, justification?, old_amount?, new_amount?, requires_second_approval? }
 * @returns {Promise<object>} The created approval
 */
export async function createApproval(data) {
  log.info({ action: 'createApproval', type: data.approval_type, eventId: data.event_id }, 'Creating approval');

  const approvalData = {
    event_id: data.event_id,
    approval_type: data.approval_type,
    status: 'pending',
    requested_by: data.requested_by,
    justification: data.justification || null,
    old_amount: data.old_amount ?? null,
    new_amount: data.new_amount ?? null,
    requires_second_approval: data.requires_second_approval ?? false,
  };

  const approval = await approvalsRepo.create(approvalData);

  // Write audit trail
  await writeAudit({
    eventId: data.event_id,
    subjectType: 'approval',
    subjectId: approval.id,
    action: 'create',
    actorUserId: data.requested_by,
    before: null,
    after: approval,
    notes: `Approval of type '${data.approval_type}' created for event ${data.event_id}`,
  });

  return approval;
}

/**
 * Approve an approval request.
 *
 * If the approval requires a second approver and only the first has approved,
 * the status remains 'pending'. Otherwise it transitions to 'approved'.
 *
 * Handles side effects:
 * - budget_override: updates event budget_cap
 * - budget_change: applies new budget to event
 *
 * @param {string} userId        - The ID of the user approving
 * @param {string} approvalId    - The approval UUID
 * @param {string} [justification] - Optional justification note
 * @returns {Promise<object>} The updated approval
 */
export async function approveApproval(userId, approvalId, justification) {
  log.info({ action: 'approveApproval', userId, approvalId }, 'Approving approval');

  const approval = await approvalsRepo.findById(approvalId);
  if (!approval) {
    throw new NotFoundError('Approval', approvalId);
  }

  if (approval.status !== 'pending') {
    throw new ValidationError([
      { path: 'status', message: `Approval is already '${approval.status}', cannot approve` },
    ]);
  }

  // Prevent the requester from approving their own request
  if (approval.requested_by === userId) {
    throw new ForbiddenError('Cannot approve your own request');
  }

  // Prevent the same user from being both first and second approver
  if (approval.first_approver_id === userId) {
    throw new ForbiddenError('You have already approved this request as first approver');
  }

  const before = { ...approval };
  const updateData = {};

  if (!approval.first_approver_id) {
    // First approval
    updateData.first_approver_id = userId;

    if (approval.requires_second_approval) {
      // Stays pending, waiting for second approver
      if (justification) {
        updateData.justification = justification;
      }
    } else {
      // Single approver is sufficient
      updateData.status = 'approved';
      updateData.decided_at = new Date();
      if (justification) {
        updateData.justification = justification;
      }
    }
  } else {
    // Second approval (first_approver already set)
    updateData.second_approver_id = userId;
    updateData.status = 'approved';
    updateData.decided_at = new Date();
    if (justification) {
      updateData.justification = justification;
    }
  }

  const updated = await approvalsRepo.update(approvalId, updateData);

  // Handle side effects when fully approved
  if (updated.status === 'approved') {
    await handleApprovalSideEffects(updated);
  }

  // Write audit trail
  await writeAudit({
    eventId: approval.event_id,
    subjectType: 'approval',
    subjectId: approvalId,
    action: updated.status === 'approved' ? 'approve' : 'first_approve',
    actorUserId: userId,
    before,
    after: updated,
    notes: updated.status === 'approved'
      ? `Approval '${approval.approval_type}' approved${justification ? `: ${justification}` : ''}`
      : `First approval recorded for '${approval.approval_type}'${justification ? `: ${justification}` : ''}`,
  });

  return updated;
}

/**
 * Reject an approval request.
 *
 * @param {string} userId        - The ID of the user rejecting
 * @param {string} approvalId    - The approval UUID
 * @param {string} [justification] - Optional justification note
 * @returns {Promise<object>} The updated approval
 */
export async function rejectApproval(userId, approvalId, justification) {
  log.info({ action: 'rejectApproval', userId, approvalId }, 'Rejecting approval');

  const approval = await approvalsRepo.findById(approvalId);
  if (!approval) {
    throw new NotFoundError('Approval', approvalId);
  }

  if (approval.status !== 'pending') {
    throw new ValidationError([
      { path: 'status', message: `Approval is already '${approval.status}', cannot reject` },
    ]);
  }

  const before = { ...approval };

  const updateData = {
    status: 'rejected',
    decided_at: new Date(),
  };

  if (justification) {
    updateData.justification = justification;
  }

  // Record who rejected — use first_approver_id if not set, otherwise second
  if (!approval.first_approver_id) {
    updateData.first_approver_id = userId;
  } else {
    updateData.second_approver_id = userId;
  }

  const updated = await approvalsRepo.update(approvalId, updateData);

  // Write audit trail
  await writeAudit({
    eventId: approval.event_id,
    subjectType: 'approval',
    subjectId: approvalId,
    action: 'reject',
    actorUserId: userId,
    before,
    after: updated,
    notes: `Approval '${approval.approval_type}' rejected${justification ? `: ${justification}` : ''}`,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Side-effect handlers
// ---------------------------------------------------------------------------

/**
 * Handle side effects when an approval is fully approved.
 *
 * @param {object} approval - The approved approval record
 */
async function handleApprovalSideEffects(approval) {
  switch (approval.approval_type) {
    case 'budget_override': {
      // Update the event's budget_cap to the new_amount
      if (approval.new_amount != null) {
        await db('events')
          .where({ id: approval.event_id })
          .update({
            budget_cap: approval.new_amount,
            updated_at: db.fn.now(),
          });

        log.info(
          { action: 'sideEffect:budget_override', eventId: approval.event_id, newCap: approval.new_amount },
          'Updated event budget_cap after budget_override approval',
        );
      }
      break;
    }

    case 'budget_change': {
      // Apply the new budget amount to the event
      if (approval.new_amount != null) {
        await db('events')
          .where({ id: approval.event_id })
          .update({
            budget_amount: approval.new_amount,
            updated_at: db.fn.now(),
          });

        log.info(
          { action: 'sideEffect:budget_change', eventId: approval.event_id, newBudget: approval.new_amount },
          'Updated event budget_amount after budget_change approval',
        );
      }
      break;
    }

    default:
      // No side effects for other approval types
      break;
  }
}
