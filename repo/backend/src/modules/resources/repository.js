/**
 * Resources / Catalog Repository
 *
 * Database access layer for resources, metadata templates, tags,
 * and training links. All functions return plain objects.
 */

import db from '../../db/connection.js';
import { createLogger } from '../../logging/index.js';
import { applyPagination } from '../../shared/pagination.js';

const log = createLogger('resources:repository');

// ---------------------------------------------------------------------------
// Allowed sort columns for paginated resource queries
// ---------------------------------------------------------------------------
const ALLOWED_RESOURCE_SORTS = [
  'name',
  'resource_type',
  'status',
  'created_at',
  'updated_at',
];

const ALLOWED_TEMPLATE_SORTS = [
  'resource_type',
  'status',
  'version',
  'created_at',
  'updated_at',
];

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

/**
 * Find a resource by ID, including its template, tags, and training links.
 *
 * @param {string} id - Resource UUID
 * @returns {Promise<object|null>}
 */
export async function findById(id) {
  log.debug({ action: 'findById', id }, 'Looking up resource by id');

  const resource = await db('resources')
    .select(
      'resources.*',
      'metadata_templates.resource_type as template_resource_type',
      'metadata_templates.required_fields_json as template_required_fields_json',
      'metadata_templates.validation_rules_json as template_validation_rules_json',
      'metadata_templates.version as template_version',
      'metadata_templates.status as template_status',
    )
    .leftJoin('metadata_templates', 'metadata_templates.id', 'resources.template_id')
    .where('resources.id', id)
    .first();

  if (!resource) return null;

  const [tags, trainingLinks] = await Promise.all([
    db('resource_tags')
      .where('resource_id', id)
      .select('id', 'tag'),
    db('resource_training_links')
      .where('resource_id', id)
      .select('id', 'course_ref', 'grade_level', 'subject_area'),
  ]);

  return { ...resource, tags, training_links: trainingLinks };
}

/**
 * Return a paginated list of resources.
 *
 * @param {object} filters
 * @param {number}  filters.page
 * @param {number}  filters.pageSize
 * @param {string}  [filters.sortBy]
 * @param {'asc'|'desc'} [filters.sortDir]
 * @param {string}  [filters.status]
 * @param {string}  [filters.resource_type]
 * @param {string}  [filters.search]
 * @returns {Promise<{ data: object[], total: number }>}
 */
export async function findAll(filters) {
  const {
    page = 1,
    pageSize = 20,
    sortBy,
    sortDir = 'asc',
    status,
    resource_type,
    search,
  } = filters;

  log.debug({ action: 'findAll', page, pageSize, status, resource_type }, 'Listing resources');

  let baseQuery = db('resources');

  if (status) {
    baseQuery = baseQuery.where('status', status);
  }
  if (resource_type) {
    baseQuery = baseQuery.where('resource_type', resource_type);
  }
  if (search) {
    baseQuery = baseQuery.where('name', 'ilike', `%${search}%`);
  }

  // Count total rows
  const [{ count }] = await baseQuery.clone().count('id as count');
  const total = Number(count);

  // Build paginated query
  let query = baseQuery
    .clone()
    .select('*');

  query = applyPagination(query, {
    page,
    pageSize,
    sortBy: sortBy || 'created_at',
    sortDir: sortBy ? sortDir : 'desc',
    allowedSorts: ALLOWED_RESOURCE_SORTS,
  });

  const data = await query;

  return { data, total };
}

/**
 * Build a hierarchical tree of published resources.
 *
 * Uses application-level recursion to assemble the tree from a flat list
 * of published resources ordered by name.
 *
 * @returns {Promise<object[]>} Array of root nodes, each with a `children` array
 */
export async function getTree() {
  log.debug({ action: 'getTree' }, 'Building resource catalog tree');

  const rows = await db('resources')
    .where('status', 'published')
    .select(
      'id',
      'parent_id',
      'name',
      'resource_type',
      'template_id',
      'metadata_json',
      'requires_approval',
      'quota_per_event',
      'version',
      'status',
    )
    .orderBy('name', 'asc');

  // Index by id for O(1) lookup
  const byId = new Map();
  for (const row of rows) {
    byId.set(row.id, { ...row, children: [] });
  }

  const roots = [];
  for (const node of byId.values()) {
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id).children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Create a new resource.
 *
 * @param {object} data
 * @returns {Promise<object>} The created resource row
 */
export async function create(data) {
  log.info({ action: 'create', name: data.name }, 'Creating resource');

  const [resource] = await db('resources')
    .insert({
      name: data.name,
      resource_type: data.resource_type,
      parent_id: data.parent_id || null,
      template_id: data.template_id || null,
      metadata_json: data.metadata_json ? JSON.stringify(data.metadata_json) : '{}',
      requires_approval: data.requires_approval ?? false,
      quota_per_event: data.quota_per_event ?? null,
      status: 'draft',
      version: 1,
    })
    .returning('*');

  return resource;
}

/**
 * Update an existing resource.
 *
 * @param {string} id
 * @param {object} data - Fields to update
 * @returns {Promise<object|null>} Updated resource or null if not found
 */
export async function update(id, data) {
  log.info({ action: 'update', id }, 'Updating resource');

  const updatePayload = {};
  if (data.name !== undefined) updatePayload.name = data.name;
  if (data.resource_type !== undefined) updatePayload.resource_type = data.resource_type;
  if (data.parent_id !== undefined) updatePayload.parent_id = data.parent_id;
  if (data.template_id !== undefined) updatePayload.template_id = data.template_id;
  if (data.metadata_json !== undefined) {
    updatePayload.metadata_json = JSON.stringify(data.metadata_json);
  }
  if (data.requires_approval !== undefined) updatePayload.requires_approval = data.requires_approval;
  if (data.quota_per_event !== undefined) updatePayload.quota_per_event = data.quota_per_event;

  if (Object.keys(updatePayload).length === 0) return findById(id);

  const [updated] = await db('resources')
    .where({ id })
    .update(updatePayload)
    .returning('*');

  return updated || null;
}

/**
 * Publish a resource: set status to 'published' and increment version.
 *
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function publish(id) {
  log.info({ action: 'publish', id }, 'Publishing resource');

  const [updated] = await db('resources')
    .where({ id })
    .update({
      status: 'published',
      version: db.raw('version + 1'),
    })
    .returning('*');

  return updated || null;
}

/**
 * Unpublish a resource: set status to 'unpublished'.
 *
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function unpublish(id) {
  log.info({ action: 'unpublish', id }, 'Unpublishing resource');

  const [updated] = await db('resources')
    .where({ id })
    .update({ status: 'unpublished' })
    .returning('*');

  return updated || null;
}

/**
 * Add a tag to a resource.
 *
 * @param {string} resourceId
 * @param {string} tag
 * @returns {Promise<object>} The created tag row
 */
export async function addTag(resourceId, tag) {
  log.info({ action: 'addTag', resourceId, tag }, 'Adding tag to resource');

  const [row] = await db('resource_tags')
    .insert({ resource_id: resourceId, tag })
    .returning('*');

  return row;
}

/**
 * Remove a tag from a resource.
 *
 * @param {string} resourceId
 * @param {string} tag
 * @returns {Promise<number>} Number of deleted rows (0 or 1)
 */
export async function removeTag(resourceId, tag) {
  log.info({ action: 'removeTag', resourceId, tag }, 'Removing tag from resource');

  return db('resource_tags')
    .where({ resource_id: resourceId, tag })
    .del();
}

/**
 * Add a training link to a resource.
 *
 * @param {object} data
 * @param {string} data.resource_id
 * @param {string} [data.course_ref]
 * @param {string} [data.grade_level]
 * @param {string} [data.subject_area]
 * @returns {Promise<object>} The created training link row
 */
export async function addTrainingLink(data) {
  log.info({ action: 'addTrainingLink', resourceId: data.resource_id }, 'Adding training link');

  const [row] = await db('resource_training_links')
    .insert({
      resource_id: data.resource_id,
      course_ref: data.course_ref || null,
      grade_level: data.grade_level || null,
      subject_area: data.subject_area || null,
    })
    .returning('*');

  return row;
}

// ---------------------------------------------------------------------------
// Metadata Templates
// ---------------------------------------------------------------------------

/**
 * Find a metadata template by ID.
 *
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function findTemplateById(id) {
  log.debug({ action: 'findTemplateById', id }, 'Looking up template by id');

  return db('metadata_templates').where({ id }).first();
}

/**
 * List all metadata templates.
 *
 * @returns {Promise<object[]>}
 */
export async function findAllTemplates() {
  log.debug({ action: 'findAllTemplates' }, 'Listing all templates');

  return db('metadata_templates')
    .select('*')
    .orderBy('resource_type', 'asc');
}

/**
 * Create a metadata template.
 *
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function createTemplate(data) {
  log.info({ action: 'createTemplate', resourceType: data.resource_type }, 'Creating template');

  const [template] = await db('metadata_templates')
    .insert({
      resource_type: data.resource_type,
      required_fields_json: JSON.stringify(data.required_fields_json || []),
      validation_rules_json: JSON.stringify(data.validation_rules_json || {}),
      status: 'draft',
      version: 1,
    })
    .returning('*');

  return template;
}

/**
 * Update a metadata template.
 *
 * @param {string} id
 * @param {object} data
 * @returns {Promise<object|null>}
 */
export async function updateTemplate(id, data) {
  log.info({ action: 'updateTemplate', id }, 'Updating template');

  const updatePayload = {};
  if (data.resource_type !== undefined) updatePayload.resource_type = data.resource_type;
  if (data.required_fields_json !== undefined) {
    updatePayload.required_fields_json = JSON.stringify(data.required_fields_json);
  }
  if (data.validation_rules_json !== undefined) {
    updatePayload.validation_rules_json = JSON.stringify(data.validation_rules_json);
  }

  if (Object.keys(updatePayload).length === 0) return findTemplateById(id);

  const [updated] = await db('metadata_templates')
    .where({ id })
    .update(updatePayload)
    .returning('*');

  return updated || null;
}

/**
 * Publish a metadata template: set status to 'published' and increment version.
 *
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function publishTemplate(id) {
  log.info({ action: 'publishTemplate', id }, 'Publishing template');

  const [updated] = await db('metadata_templates')
    .where({ id })
    .update({
      status: 'published',
      version: db.raw('version + 1'),
    })
    .returning('*');

  return updated || null;
}

/**
 * Validate resource metadata against a template's required_fields and validation_rules.
 *
 * @param {object} metadata   - The metadata JSON object from the resource
 * @param {object} template   - The metadata template row
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateMetadata(metadata, template) {
  const errors = [];

  // Parse required fields
  const requiredFields = typeof template.required_fields_json === 'string'
    ? JSON.parse(template.required_fields_json)
    : (template.required_fields_json || []);

  // Parse validation rules
  const validationRules = typeof template.validation_rules_json === 'string'
    ? JSON.parse(template.validation_rules_json)
    : (template.validation_rules_json || {});

  // Check required fields are present and non-empty
  for (const field of requiredFields) {
    const fieldName = typeof field === 'string' ? field : field.name;
    if (fieldName && (metadata[fieldName] === undefined || metadata[fieldName] === null || metadata[fieldName] === '')) {
      errors.push(`Missing required field: '${fieldName}'`);
    }
  }

  // Apply validation rules (simple type/pattern/min/max checks)
  for (const [fieldName, rules] of Object.entries(validationRules)) {
    const value = metadata[fieldName];
    if (value === undefined || value === null) continue; // required check already handled above

    if (rules.type) {
      const actualType = typeof value;
      if (rules.type === 'number' && actualType !== 'number') {
        errors.push(`Field '${fieldName}' must be of type '${rules.type}'`);
      }
      if (rules.type === 'string' && actualType !== 'string') {
        errors.push(`Field '${fieldName}' must be of type '${rules.type}'`);
      }
      if (rules.type === 'boolean' && actualType !== 'boolean') {
        errors.push(`Field '${fieldName}' must be of type '${rules.type}'`);
      }
    }

    if (rules.pattern && typeof value === 'string') {
      const regex = new RegExp(rules.pattern);
      if (!regex.test(value)) {
        errors.push(`Field '${fieldName}' does not match pattern '${rules.pattern}'`);
      }
    }

    if (rules.min !== undefined && typeof value === 'number' && value < rules.min) {
      errors.push(`Field '${fieldName}' must be >= ${rules.min}`);
    }

    if (rules.max !== undefined && typeof value === 'number' && value > rules.max) {
      errors.push(`Field '${fieldName}' must be <= ${rules.max}`);
    }

    if (rules.minLength !== undefined && typeof value === 'string' && value.length < rules.minLength) {
      errors.push(`Field '${fieldName}' must be at least ${rules.minLength} characters`);
    }

    if (rules.maxLength !== undefined && typeof value === 'string' && value.length > rules.maxLength) {
      errors.push(`Field '${fieldName}' must be at most ${rules.maxLength} characters`);
    }
  }

  return { valid: errors.length === 0, errors };
}
