/**
 * Recipes Repository
 *
 * Database access layer for recipe and recipe-version operations.
 * All functions return plain objects (no ORM models).
 */

import db from '../../db/connection.js';
import { createLogger } from '../../logging/index.js';

const log = createLogger('recipes:repository');

/**
 * Create a new recipe record.
 *
 * @param {object} data
 * @param {string} data.slug - URL-friendly slug
 * @returns {Promise<object>} The inserted recipe row
 */
export async function create(data) {
  log.debug({ action: 'create', slug: data.slug }, 'Creating recipe');

  const [recipe] = await db('recipes')
    .insert({
      slug: data.slug,
    })
    .returning(['id', 'slug', 'current_version_id', 'created_at', 'updated_at']);

  return recipe;
}

/**
 * Find a recipe by ID, including current version info.
 *
 * @param {string} id - Recipe UUID
 * @returns {Promise<object|null>} Recipe with current version data, or null
 */
export async function findById(id) {
  log.debug({ action: 'findById', id }, 'Looking up recipe by id');

  const recipe = await db('recipes')
    .select(
      'recipes.id',
      'recipes.slug',
      'recipes.current_version_id',
      'recipes.created_at',
      'recipes.updated_at',
    )
    .where('recipes.id', id)
    .first();

  if (!recipe) return null;

  // Attach current version info if set
  if (recipe.current_version_id) {
    const currentVersion = await db('recipe_versions')
      .where('id', recipe.current_version_id)
      .first();
    recipe.current_version = currentVersion || null;
  } else {
    recipe.current_version = null;
  }

  return recipe;
}

/**
 * Return a paginated list of recipes with optional status filter.
 *
 * When a status filter is provided, only recipes whose latest version
 * matches that status are returned.
 *
 * @param {object}  filters
 * @param {number}  filters.page
 * @param {number}  filters.pageSize
 * @param {string}  [filters.status] - Optional version status filter
 * @returns {Promise<{ data: object[], total: number }>}
 */
export async function findAll({ page = 1, pageSize = 20, status }) {
  log.debug({ action: 'findAll', page, pageSize, status }, 'Listing recipes');

  let baseQuery = db('recipes')
    .leftJoin('recipe_versions as cv', 'cv.id', 'recipes.current_version_id');

  if (status) {
    baseQuery = baseQuery.where('cv.status', status);
  }

  // Count total rows
  const [{ count }] = await baseQuery.clone().count('recipes.id as count');
  const total = Number(count);

  // Build paginated query
  const offset = (page - 1) * pageSize;
  const recipes = await baseQuery
    .clone()
    .select(
      'recipes.id',
      'recipes.slug',
      'recipes.current_version_id',
      'recipes.created_at',
      'recipes.updated_at',
      'cv.title as current_version_title',
      'cv.version_no as current_version_no',
      'cv.status as current_version_status',
    )
    .orderBy('recipes.created_at', 'desc')
    .limit(pageSize)
    .offset(offset);

  return { data: recipes, total };
}

/**
 * List only recipes whose current version is approved.
 *
 * @returns {Promise<object[]>}
 */
export async function findApproved() {
  log.debug({ action: 'findApproved' }, 'Listing approved recipes');

  return db('recipes')
    .join('recipe_versions as cv', 'cv.id', 'recipes.current_version_id')
    .where('cv.status', 'approved')
    .select(
      'recipes.id',
      'recipes.slug',
      'recipes.current_version_id',
      'recipes.created_at',
      'recipes.updated_at',
      'cv.title as current_version_title',
      'cv.version_no as current_version_no',
      'cv.status as current_version_status',
    )
    .orderBy('recipes.created_at', 'desc');
}

/**
 * Create a new recipe version.
 * Automatically increments version_no from the latest version for the given recipe_id.
 *
 * @param {object} data
 * @param {string} data.recipe_id
 * @param {string} data.title
 * @param {object} [data.steps_json]
 * @param {object} [data.quantities_json]
 * @param {string} [data.difficulty]
 * @param {number} [data.time_estimate_minutes]
 * @param {object} [data.tags_json]
 * @param {string} [data.rich_text_html]
 * @param {string} [data.status]
 * @returns {Promise<object>} The inserted recipe_version row
 */
export async function createVersion(data) {
  log.debug({ action: 'createVersion', recipeId: data.recipe_id }, 'Creating recipe version');

  // Determine next version number
  const latestVersion = await db('recipe_versions')
    .where('recipe_id', data.recipe_id)
    .max('version_no as max_version_no')
    .first();

  const nextVersionNo = (latestVersion?.max_version_no || 0) + 1;

  const [version] = await db('recipe_versions')
    .insert({
      recipe_id: data.recipe_id,
      version_no: nextVersionNo,
      title: data.title,
      steps_json: data.steps_json ? JSON.stringify(data.steps_json) : '[]',
      quantities_json: data.quantities_json ? JSON.stringify(data.quantities_json) : '[]',
      difficulty: data.difficulty || null,
      time_estimate_minutes: data.time_estimate_minutes || null,
      tags_json: data.tags_json ? JSON.stringify(data.tags_json) : '[]',
      rich_text_html: data.rich_text_html || null,
      status: data.status || 'draft',
    })
    .returning([
      'id', 'recipe_id', 'version_no', 'title', 'steps_json', 'quantities_json',
      'difficulty', 'time_estimate_minutes', 'tags_json', 'rich_text_html',
      'status', 'approved_by', 'approved_at', 'created_at', 'updated_at',
    ]);

  return version;
}

/**
 * Find a recipe version by its ID.
 *
 * @param {string} id - Recipe version UUID
 * @returns {Promise<object|null>}
 */
export async function findVersionById(id) {
  log.debug({ action: 'findVersionById', id }, 'Looking up recipe version by id');

  return db('recipe_versions').where('id', id).first() || null;
}

/**
 * List all versions for a given recipe, ordered by version_no descending.
 *
 * @param {string} recipeId - Recipe UUID
 * @returns {Promise<object[]>}
 */
export async function findVersionsByRecipeId(recipeId) {
  log.debug({ action: 'findVersionsByRecipeId', recipeId }, 'Listing recipe versions');

  return db('recipe_versions')
    .where('recipe_id', recipeId)
    .orderBy('version_no', 'desc');
}

/**
 * Update the status of a recipe version.
 *
 * @param {string}  id         - Recipe version UUID
 * @param {string}  status     - New status
 * @param {string}  [approvedBy] - User UUID of approver
 * @param {string}  [approvedAt] - ISO timestamp of approval
 * @returns {Promise<object|null>} Updated version or null
 */
export async function updateVersionStatus(id, status, approvedBy, approvedAt) {
  log.info({ action: 'updateVersionStatus', id, status }, 'Updating recipe version status');

  const updateData = { status };
  if (approvedBy !== undefined) updateData.approved_by = approvedBy;
  if (approvedAt !== undefined) updateData.approved_at = approvedAt;

  const [updated] = await db('recipe_versions')
    .where({ id })
    .update(updateData)
    .returning([
      'id', 'recipe_id', 'version_no', 'title', 'status',
      'approved_by', 'approved_at', 'created_at', 'updated_at',
    ]);

  return updated || null;
}

/**
 * Set the current_version_id on a recipe.
 *
 * @param {string} recipeId  - Recipe UUID
 * @param {string} versionId - Recipe version UUID to set as current
 * @returns {Promise<object|null>} Updated recipe or null
 */
export async function setCurrentVersion(recipeId, versionId) {
  log.info({ action: 'setCurrentVersion', recipeId, versionId }, 'Setting current recipe version');

  const [updated] = await db('recipes')
    .where({ id: recipeId })
    .update({ current_version_id: versionId })
    .returning(['id', 'slug', 'current_version_id', 'created_at', 'updated_at']);

  return updated || null;
}
