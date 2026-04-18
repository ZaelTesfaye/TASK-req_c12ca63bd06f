/**
 * Recipes Service
 *
 * Business logic layer for recipe management, including versioning,
 * review workflows, and approval processes.
 */

import { randomUUID } from 'node:crypto';
import { createLogger } from '../../logging/index.js';
import { writeAudit } from '../../shared/audit.js';
import { NotFoundError, AppError } from '../../shared/errors.js';
import * as recipesRepo from './repository.js';

const log = createLogger('recipes:service');

/**
 * Generate a URL-friendly slug from a title string.
 *
 * @param {string} title
 * @returns {string}
 */
function slugify(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Create a new recipe with an initial draft version.
 *
 * @param {string} userId - The creating user's UUID
 * @param {object} data
 * @param {string} data.title
 * @param {string} [data.slug]
 * @param {object} [data.steps_json]
 * @param {object} [data.quantities_json]
 * @param {string} [data.difficulty]
 * @param {number} [data.time_estimate_minutes]
 * @param {object} [data.tags_json]
 * @param {string} [data.rich_text_html]
 * @returns {Promise<{ recipe: object, version: object }>}
 */
export async function createRecipe(userId, data) {
  log.info({ action: 'createRecipe', userId, title: data.title }, 'Creating new recipe');

  const slug = data.slug || slugify(data.title);

  // Create the recipe record
  const recipe = await recipesRepo.create({ slug });

  // Create the initial draft version
  const version = await recipesRepo.createVersion({
    recipe_id: recipe.id,
    title: data.title,
    steps_json: data.steps_json,
    quantities_json: data.quantities_json,
    difficulty: data.difficulty,
    time_estimate_minutes: data.time_estimate_minutes,
    tags_json: data.tags_json,
    rich_text_html: data.rich_text_html,
    status: 'draft',
  });

  // Write audit trail
  await writeAudit({
    eventId: null,
    subjectType: 'recipe',
    subjectId: recipe.id,
    action: 'create',
    actorUserId: userId,
    before: null,
    after: { recipeId: recipe.id, slug, versionId: version.id, title: data.title },
    notes: `Created recipe '${data.title}' with initial draft version`,
  });

  return { recipe, version };
}

/**
 * Create a new revision (version) for an existing recipe.
 *
 * @param {string} userId   - The creating user's UUID
 * @param {string} recipeId - The recipe UUID
 * @param {object} data     - Version data (title, steps_json, etc.)
 * @returns {Promise<object>} The new version record
 */
export async function createRevision(userId, recipeId, data) {
  log.info({ action: 'createRevision', userId, recipeId }, 'Creating recipe revision');

  // Verify recipe exists
  const recipe = await recipesRepo.findById(recipeId);
  if (!recipe) {
    throw new NotFoundError('Recipe', recipeId);
  }

  // Create the new draft version
  const version = await recipesRepo.createVersion({
    recipe_id: recipeId,
    title: data.title,
    steps_json: data.steps_json,
    quantities_json: data.quantities_json,
    difficulty: data.difficulty,
    time_estimate_minutes: data.time_estimate_minutes,
    tags_json: data.tags_json,
    rich_text_html: data.rich_text_html,
    status: 'draft',
  });

  // Write audit trail
  await writeAudit({
    eventId: null,
    subjectType: 'recipe_version',
    subjectId: version.id,
    action: 'create_revision',
    actorUserId: userId,
    before: null,
    after: { recipeId, versionId: version.id, versionNo: version.version_no, title: data.title },
    notes: `Created revision v${version.version_no} for recipe '${recipe.slug}'`,
  });

  return version;
}

/**
 * Submit the latest version of a recipe for review.
 * Changes the latest version's status from 'draft' to 'submitted_for_review'.
 *
 * @param {string} userId   - The submitting user's UUID
 * @param {string} recipeId - The recipe UUID
 * @returns {Promise<object>} The updated version record
 */
export async function submitForReview(userId, recipeId) {
  log.info({ action: 'submitForReview', userId, recipeId }, 'Submitting recipe for review');

  // Verify recipe exists
  const recipe = await recipesRepo.findById(recipeId);
  if (!recipe) {
    throw new NotFoundError('Recipe', recipeId);
  }

  // Find the latest version
  const versions = await recipesRepo.findVersionsByRecipeId(recipeId);
  if (versions.length === 0) {
    throw new AppError(422, 'NO_VERSIONS', 'Recipe has no versions to submit');
  }

  const latestVersion = versions[0]; // Already ordered desc by version_no

  if (latestVersion.status !== 'draft') {
    throw new AppError(
      422,
      'INVALID_STATUS',
      `Cannot submit version with status '${latestVersion.status}'; must be 'draft'`,
    );
  }

  // Update status
  const updated = await recipesRepo.updateVersionStatus(
    latestVersion.id,
    'submitted_for_review',
  );

  // Write audit trail
  await writeAudit({
    eventId: null,
    subjectType: 'recipe_version',
    subjectId: latestVersion.id,
    action: 'submit_for_review',
    actorUserId: userId,
    before: { status: 'draft' },
    after: { status: 'submitted_for_review' },
    notes: `Submitted recipe '${recipe.slug}' v${latestVersion.version_no} for review`,
  });

  return updated;
}

/**
 * Approve a recipe version that has been submitted for review.
 * Sets the version as approved, records the approver, and sets it as the current version.
 * Only 'approved' versions can be used in event materials.
 *
 * @param {string} userId   - The approving user's UUID
 * @param {string} recipeId - The recipe UUID
 * @returns {Promise<object>} The updated version record
 */
export async function approveRecipe(userId, recipeId) {
  log.info({ action: 'approveRecipe', userId, recipeId }, 'Approving recipe');

  // Verify recipe exists
  const recipe = await recipesRepo.findById(recipeId);
  if (!recipe) {
    throw new NotFoundError('Recipe', recipeId);
  }

  // Find the latest version with status 'submitted_for_review'
  const versions = await recipesRepo.findVersionsByRecipeId(recipeId);
  const submittedVersion = versions.find((v) => v.status === 'submitted_for_review');

  if (!submittedVersion) {
    throw new AppError(
      422,
      'NO_SUBMITTED_VERSION',
      'No version with status \'submitted_for_review\' found for this recipe',
    );
  }

  const approvedAt = new Date().toISOString();

  // Update version status to approved
  const updated = await recipesRepo.updateVersionStatus(
    submittedVersion.id,
    'approved',
    userId,
    approvedAt,
  );

  // Set as current version on the recipe
  await recipesRepo.setCurrentVersion(recipeId, submittedVersion.id);

  // Write audit trail
  await writeAudit({
    eventId: null,
    subjectType: 'recipe_version',
    subjectId: submittedVersion.id,
    action: 'approve',
    actorUserId: userId,
    before: { status: 'submitted_for_review' },
    after: { status: 'approved', approvedBy: userId, approvedAt },
    notes: `Approved recipe '${recipe.slug}' v${submittedVersion.version_no} and set as current version`,
  });

  return updated;
}

/**
 * Reject a recipe version that has been submitted for review.
 *
 * @param {string}  userId   - The rejecting user's UUID
 * @param {string}  recipeId - The recipe UUID
 * @param {string}  [notes]  - Optional rejection notes
 * @returns {Promise<object>} The updated version record
 */
export async function rejectRecipe(userId, recipeId, notes) {
  log.info({ action: 'rejectRecipe', userId, recipeId }, 'Rejecting recipe');

  // Verify recipe exists
  const recipe = await recipesRepo.findById(recipeId);
  if (!recipe) {
    throw new NotFoundError('Recipe', recipeId);
  }

  // Find the latest submitted version
  const versions = await recipesRepo.findVersionsByRecipeId(recipeId);
  const submittedVersion = versions.find((v) => v.status === 'submitted_for_review');

  if (!submittedVersion) {
    throw new AppError(
      422,
      'NO_SUBMITTED_VERSION',
      'No version with status \'submitted_for_review\' found for this recipe',
    );
  }

  // Update version status to rejected
  const updated = await recipesRepo.updateVersionStatus(
    submittedVersion.id,
    'rejected',
  );

  // Write audit trail
  await writeAudit({
    eventId: null,
    subjectType: 'recipe_version',
    subjectId: submittedVersion.id,
    action: 'reject',
    actorUserId: userId,
    before: { status: 'submitted_for_review' },
    after: { status: 'rejected' },
    notes: notes || `Rejected recipe '${recipe.slug}' v${submittedVersion.version_no}`,
  });

  return updated;
}
