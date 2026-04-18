/**
 * Events Service
 *
 * Business logic layer for event operations, including state machine
 * transitions, budget validation, and audit trail recording.
 */

import { createLogger } from '../../logging/index.js';
import { writeAudit } from '../../shared/audit.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../../shared/errors.js';
import * as eventsRepo from './repository.js';
import * as approvalsRepo from '../approvals/repository.js';
import * as approvalsService from '../approvals/service.js';
import db from '../../db/connection.js';

const log = createLogger('events:service');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DEFAULT_BUDGET_CAP = 25000;
const BUDGET_CHANGE_THRESHOLD_PERCENT = 10;

// ---------------------------------------------------------------------------
// Valid state transitions
// ---------------------------------------------------------------------------
const STATE_TRANSITIONS = {
  draft: ['submitted'],
  submitted: ['approved'],
  approved: ['in_service'],
  in_service: ['closed'],
  closed: [],
};

// ---------------------------------------------------------------------------
// Service methods
// ---------------------------------------------------------------------------

/**
 * Create a new event in draft state.
 *
 * @param {string} userId - The ID of the user creating the event
 * @param {object} data   - { title, description?, event_date, headcount, budget_amount, budget_cap? }
 * @returns {Promise<object>} The created event
 */
export async function createEvent(userId, data) {
  log.info({ action: 'createEvent', userId }, 'Creating new event');

  const eventData = {
    title: data.title,
    description: data.description || null,
    event_date: data.event_date,
    headcount: data.headcount,
    budget_amount: data.budget_amount,
    budget_cap: data.budget_cap ?? DEFAULT_BUDGET_CAP,
    state: 'draft',
    created_by: userId,
  };

  // Enforce the system-wide cap on creation. An approved budget_override
  // approval is event-scoped, so it cannot exist before the event does —
  // the caller must first create a compliant event, then request a cap
  // override via the approvals workflow.
  if (eventData.budget_amount > DEFAULT_BUDGET_CAP) {
    throw new ValidationError([{
      path: 'budget_amount',
      message: `Budget amount ($${eventData.budget_amount}) exceeds the system cap of $${DEFAULT_BUDGET_CAP}. An approved budget_override is required to raise the cap after creation.`,
    }]);
  }
  if (data.budget_cap !== undefined && data.budget_cap > DEFAULT_BUDGET_CAP) {
    throw new ValidationError([{
      path: 'budget_cap',
      message: `Custom budget cap ($${data.budget_cap}) exceeds the system cap of $${DEFAULT_BUDGET_CAP}. Raising the cap requires an approved budget_override.`,
    }]);
  }

  const event = await eventsRepo.create(eventData);

  // Write audit trail
  await writeAudit({
    eventId: event.id,
    subjectType: 'event',
    subjectId: event.id,
    action: 'create',
    actorUserId: userId,
    before: null,
    after: event,
    notes: `Event '${event.title}' created in draft state`,
  });

  return event;
}

/**
 * Update an event. Handles budget change logic and ownership verification.
 *
 * @param {string} userId  - The ID of the user performing the update
 * @param {string} eventId - The event UUID
 * @param {object} data    - Fields to update
 * @returns {Promise<object>} The updated event
 */
export async function updateEvent(userId, eventId, data) {
  log.info({ action: 'updateEvent', userId, eventId }, 'Updating event');

  const event = await eventsRepo.findById(eventId);
  if (!event) {
    throw new NotFoundError('Event', eventId);
  }

  // Only the creator can update while in draft or submitted state
  if (event.created_by !== userId) {
    throw new ForbiddenError('Only the event creator can update this event');
  }
  if (!['draft', 'submitted'].includes(event.state)) {
    throw new ForbiddenError(`Cannot update event in '${event.state}' state`);
  }

  const before = { ...event };

  // Mutable copy we may strip fields from if their change is gated behind
  // an approval that hasn't been resolved yet.
  const updateData = { ...data };
  let budgetChangePending = false;

  // ---- budget_cap change validation ------------------------------------
  // A caller cannot raise the cap above the system ceiling unless an
  // approved budget_override already exists for this event. Lowering the
  // cap is always fine (tightens the rule, doesn't loosen it).
  if (
    data.budget_cap !== undefined &&
    Number(data.budget_cap) > Number(event.budget_cap) &&
    Number(data.budget_cap) > DEFAULT_BUDGET_CAP
  ) {
    const approvals = await approvalsRepo.findByEventId(eventId);
    const approvedOverride = approvals.find(
      (a) => a.approval_type === 'budget_override' && a.status === 'approved',
    );
    if (!approvedOverride) {
      throw new ValidationError([
        {
          path: 'budget_cap',
          message: `Raising budget_cap to ${data.budget_cap} exceeds the system cap of ${DEFAULT_BUDGET_CAP}. An approved budget_override is required.`,
        },
      ]);
    }
  }

  // ---- budget_amount change handling -----------------------------------
  if (data.budget_amount !== undefined && data.budget_amount !== Number(event.budget_amount)) {
    const newBudget = data.budget_amount;
    const currentCap = data.budget_cap ?? Number(event.budget_cap);

    // Over-cap requires an already-approved budget_override.
    if (newBudget > currentCap) {
      const approvals = await approvalsRepo.findByEventId(eventId);
      const approvedOverride = approvals.find(
        (a) => a.approval_type === 'budget_override' && a.status === 'approved',
      );
      if (!approvedOverride) {
        throw new ValidationError([
          {
            path: 'budget_amount',
            message: `Budget amount ${newBudget} exceeds cap of ${currentCap}. A budget_override approval is required.`,
          },
        ]);
      }
    }

    // For non-draft events we track a revision + possibly create a pending
    // budget_change approval. When the change exceeds the threshold, we
    // persist the *requested* value as a pending approval and strip
    // budget_amount from the in-flight update so the stored amount stays at
    // its previous value until the approval is resolved.
    if (event.state !== 'draft') {
      const revisions = await eventsRepo.getBudgetRevisions(eventId);
      const lastApproved = revisions.length > 0
        ? revisions[revisions.length - 1]
        : null;
      const baseBudget = lastApproved
        ? Number(lastApproved.new_budget_amount)
        : Number(event.budget_amount);

      const changePercent = baseBudget > 0
        ? Math.abs((newBudget - baseBudget) / baseBudget) * 100
        : 100;

      const nextRevisionNo = revisions.length + 1;
      let approvalId = null;

      if (changePercent > BUDGET_CHANGE_THRESHOLD_PERCENT) {
        const approval = await approvalsService.createApproval({
          event_id: eventId,
          approval_type: 'budget_change',
          requested_by: userId,
          old_amount: baseBudget,
          new_amount: newBudget,
          justification: `Budget change of ${changePercent.toFixed(2)}% exceeds ${BUDGET_CHANGE_THRESHOLD_PERCENT}% threshold`,
        });
        approvalId = approval.id;
        budgetChangePending = true;
        // Do NOT mutate budget_amount on disk yet — the change is pending
        // approval. The revision row captures the requested amount for the
        // approver to review, but the live value stays put.
        delete updateData.budget_amount;
      }

      await eventsRepo.addBudgetRevision({
        event_id: eventId,
        revision_no: nextRevisionNo,
        old_budget_amount: baseBudget,
        new_budget_amount: newBudget,
        change_percent: changePercent.toFixed(2),
        changed_by: userId,
        approval_id: approvalId,
      });
    }
  }

  // Apply the (possibly stripped-down) update.
  const updated = await eventsRepo.update(eventId, updateData);
  if (budgetChangePending) {
    updated.budget_change_pending = true;
  }

  // Write audit trail with before/after
  await writeAudit({
    eventId,
    subjectType: 'event',
    subjectId: eventId,
    action: 'update',
    actorUserId: userId,
    before,
    after: updated,
    notes: `Event '${updated.title}' updated`,
  });

  return updated;
}

/**
 * Transition an event through the state machine.
 *
 * @param {string} userId  - The ID of the user performing the transition
 * @param {string} eventId - The event UUID
 * @param {string} newState - The target state
 * @returns {Promise<object>} The updated event
 */
export async function transitionState(userId, eventId, newState) {
  log.info({ action: 'transitionState', userId, eventId, newState }, 'Transitioning event state');

  const event = await eventsRepo.findById(eventId);
  if (!event) {
    throw new NotFoundError('Event', eventId);
  }

  const currentState = event.state;

  // Validate the transition is allowed
  const allowedNextStates = STATE_TRANSITIONS[currentState];
  if (!allowedNextStates || !allowedNextStates.includes(newState)) {
    throw new ValidationError([
      {
        path: 'state',
        message: `Cannot transition from '${currentState}' to '${newState}'. Allowed transitions: ${(allowedNextStates || []).join(', ') || 'none'}`,
      },
    ]);
  }

  // Apply state-specific validations
  switch (`${currentState}->${newState}`) {
    case 'draft->submitted': {
      await validateSubmission(event, eventId);
      break;
    }
    case 'submitted->approved': {
      await validateApproval(event, eventId);
      break;
    }
    case 'approved->in_service': {
      // Permission check is done in the route layer via authorize('event:service')
      break;
    }
    case 'in_service->closed': {
      await validateClosure(eventId);
      break;
    }
  }

  // Perform the state update
  const approvedAt = newState === 'approved' ? new Date() : undefined;
  const updated = await eventsRepo.updateState(eventId, newState, approvedAt);

  // Write audit trail
  await writeAudit({
    eventId,
    subjectType: 'event',
    subjectId: eventId,
    action: 'state_transition',
    actorUserId: userId,
    before: { state: currentState },
    after: { state: newState },
    notes: `Event transitioned from '${currentState}' to '${newState}'`,
  });

  // On approval, trigger entitlement auto-issuance
  if (newState === 'approved') {
    await triggerEntitlementAutoIssuance(eventId, userId);
  }

  return updated;
}

/**
 * Get the paginated audit trail for an event.
 *
 * @param {string} eventId    - Event UUID
 * @param {object} pagination - { page, pageSize }
 * @returns {Promise<{ data: object[], total: number }>}
 */
export async function getEventAuditTrail(eventId, { page = 1, pageSize = 20 }) {
  log.debug({ action: 'getEventAuditTrail', eventId, page, pageSize }, 'Getting event audit trail');

  // Verify event exists
  const event = await eventsRepo.findById(eventId);
  if (!event) {
    throw new NotFoundError('Event', eventId);
  }

  const [{ count }] = await db('audit_trail')
    .where('event_id', eventId)
    .count('id as count');
  const total = Number(count);

  const offset = (page - 1) * pageSize;
  const data = await db('audit_trail')
    .where('event_id', eventId)
    .orderBy('created_at', 'desc')
    .limit(pageSize)
    .offset(offset);

  return { data, total };
}

// ---------------------------------------------------------------------------
// State transition validators
// ---------------------------------------------------------------------------

/**
 * Validate that an event can be submitted.
 * Required: title, event_date, headcount > 0, at least one service window, materials non-empty.
 */
async function validateSubmission(event, eventId) {
  const errors = [];

  if (!event.title || event.title.trim().length === 0) {
    errors.push({ path: 'title', message: 'Title is required' });
  }
  if (!event.event_date) {
    errors.push({ path: 'event_date', message: 'Event date is required' });
  }
  if (!event.headcount || event.headcount <= 0) {
    errors.push({ path: 'headcount', message: 'Headcount must be greater than 0' });
  }

  const windows = await eventsRepo.getServiceWindows(eventId);
  if (windows.length === 0) {
    errors.push({ path: 'service_windows', message: 'At least one service window is required' });
  }

  const materials = await eventsRepo.getMaterials(eventId);
  if (materials.length === 0) {
    errors.push({ path: 'materials', message: 'At least one material is required' });
  }

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }
}

/**
 * Validate that an event can be approved.
 * All pending approvals must be resolved.
 */
async function validateApproval(event, eventId) {
  const hasPending = await approvalsRepo.hasPendingForEvent(eventId);
  if (hasPending) {
    throw new ValidationError([
      {
        path: 'approvals',
        message: 'All pending approvals must be resolved (approved or rejected) before the event can be approved',
      },
    ]);
  }
}

/**
 * Validate that an event can be closed.
 * All active reservations must be returned or cancelled.
 */
async function validateClosure(eventId) {
  const activeReservations = await db('reservations')
    .where('event_id', eventId)
    .whereNotIn('status', ['returned', 'cancelled'])
    .count('id as count')
    .first();

  if (Number(activeReservations.count) > 0) {
    throw new ValidationError([
      {
        path: 'reservations',
        message: `Cannot close event: ${activeReservations.count} active reservation(s) must be returned or cancelled first`,
      },
    ]);
  }
}

/**
 * Trigger automatic entitlement issuance for an approved event.
 * Looks up active issuance rules with trigger_event = 'event_approved'
 * and creates entitlements for the event creator.
 */
async function triggerEntitlementAutoIssuance(eventId, actorUserId) {
  log.info({ action: 'triggerEntitlementAutoIssuance', eventId }, 'Triggering auto-issuance of entitlements');

  try {
    const event = await eventsRepo.findById(eventId);
    if (!event) return;

    // Find active issuance rules triggered by event approval
    const rules = await db('entitlement_issuance_rules')
      .where({ trigger_event: 'event_approved', active: true });

    for (const rule of rules) {
      // Evaluate quantity formula (simple eval supporting headcount-based formulas)
      let quantity;
      try {
        // Support formulas like 'headcount * 1', 'headcount', '10', etc.
        const formula = rule.quantity_formula.replace(/headcount/g, String(event.headcount));
        quantity = Number(evaluateSimpleFormula(formula));
      } catch {
        log.warn(
          { action: 'triggerEntitlementAutoIssuance', ruleId: rule.id, formula: rule.quantity_formula },
          'Failed to evaluate quantity formula, skipping rule',
        );
        continue;
      }

      if (!quantity || quantity <= 0) continue;

      await db('entitlements').insert({
        event_id: eventId,
        user_id: event.created_by,
        entitlement_type_id: rule.entitlement_type_id,
        quantity_total: quantity,
        quantity_remaining: quantity,
        issued_by: actorUserId,
        issuance_mode: 'auto',
      });

      await writeAudit({
        eventId,
        subjectType: 'entitlement',
        subjectId: eventId,
        action: 'auto_issue',
        actorUserId,
        before: null,
        after: { rule_id: rule.id, quantity, entitlement_type_id: rule.entitlement_type_id },
        notes: `Auto-issued ${quantity} entitlements via rule '${rule.name}'`,
      });
    }
  } catch (err) {
    // Log but do not fail the state transition
    log.error(
      { action: 'triggerEntitlementAutoIssuance', err, eventId },
      'Failed to auto-issue entitlements',
    );
  }
}

/**
 * Evaluate a simple arithmetic formula string.
 * Only supports numbers and basic operators (+, -, *, /).
 *
 * @param {string} formula
 * @returns {number}
 */
function evaluateSimpleFormula(formula) {
  // Strip whitespace and validate only safe characters
  const sanitized = formula.replace(/\s/g, '');
  if (!/^[\d.+\-*/()]+$/.test(sanitized)) {
    throw new Error(`Invalid formula: ${formula}`);
  }
  // Use Function constructor for safe arithmetic evaluation
  return new Function(`return (${sanitized})`)();
}
