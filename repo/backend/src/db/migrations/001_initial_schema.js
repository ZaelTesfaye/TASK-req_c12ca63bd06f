/**
 * 001_initial_schema.js
 *
 * Comprehensive initial migration for the Hospitality Operations Management System.
 * Creates all tables, FK constraints, CHECK constraints, indexes, defaults,
 * an updated_at trigger function, and an audit_trail protection rule.
 */

const UUID_DEFAULT = (knex) => knex.raw('gen_random_uuid()');
const NOW_DEFAULT = (knex) => knex.raw('now()');

// ---------------------------------------------------------------------------
// Tables that carry an updated_at column — trigger will be applied to each.
// ---------------------------------------------------------------------------
const TABLES_WITH_UPDATED_AT = [
  'users',
  'events',
  'metadata_templates',
  'resources',
  'recipes',
  'recipe_versions',
  'inventory_items',
  'entitlement_types',
  'entitlement_issuance_rules',
  'entitlements',
  'bulk_import_batches',
  'data_collection_jobs',
  'reservations',
];

// ===========================  UP  ==========================================
export async function up(knex) {
  // ------------------------------------------------------------------
  // 0. Utility: updated_at trigger function
  // ------------------------------------------------------------------
  await knex.raw(`
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ------------------------------------------------------------------
  // 1. IDENTITY, ROLES, PERMISSIONS
  // ------------------------------------------------------------------

  // users
  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.varchar('username', 100).unique().notNullable();
    t.text('password_hash').notNullable();
    t.text('employee_id_enc').nullable();
    t.text('phone_number_enc').nullable();
    t.text('email_enc').nullable();
    t.varchar('status', 20).notNullable().defaultTo('active');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
  });
  await knex.raw(`
    ALTER TABLE users
      ADD CONSTRAINT chk_users_status CHECK (status IN ('active','inactive','suspended'));
  `);

  // roles
  await knex.schema.createTable('roles', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.varchar('name', 50).unique().notNullable();
  });
  await knex.raw(`
    ALTER TABLE roles
      ADD CONSTRAINT chk_roles_name CHECK (name IN ('event_planner','resource_manager','culinary_editor','inventory_analyst','approver','admin'));
  `);

  // permissions
  await knex.schema.createTable('permissions', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.varchar('code', 100).unique().notNullable();
  });

  // user_roles (junction — CASCADE)
  await knex.schema.createTable('user_roles', (t) => {
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.uuid('role_id').notNullable().references('id').inTable('roles').onDelete('CASCADE');
    t.primary(['user_id', 'role_id']);
  });

  // role_permissions (junction — CASCADE)
  await knex.schema.createTable('role_permissions', (t) => {
    t.uuid('role_id').notNullable().references('id').inTable('roles').onDelete('CASCADE');
    t.uuid('permission_id').notNullable().references('id').inTable('permissions').onDelete('CASCADE');
    t.primary(['role_id', 'permission_id']);
  });

  // refresh_tokens
  await knex.schema.createTable('refresh_tokens', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.text('token_hash').notNullable();
    t.timestamp('expires_at', { useTz: true }).notNullable();
    t.uuid('rotated_from_id').nullable().references('id').inTable('refresh_tokens').onDelete('RESTRICT');
    t.timestamp('revoked_at', { useTz: true }).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
  });

  // ------------------------------------------------------------------
  // 2. EVENTS AND WORKFLOW
  // ------------------------------------------------------------------

  // events
  await knex.schema.createTable('events', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.varchar('title', 200).notNullable();
    t.text('description').nullable();
    t.date('event_date').notNullable();
    t.integer('headcount').notNullable();
    t.decimal('budget_amount', 12, 2).notNullable().defaultTo(0);
    t.decimal('budget_cap', 12, 2).notNullable().defaultTo(25000.00);
    t.varchar('state', 20).notNullable().defaultTo('draft');
    t.uuid('created_by').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.timestamp('approved_at', { useTz: true }).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
  });
  await knex.raw(`
    ALTER TABLE events
      ADD CONSTRAINT chk_events_headcount CHECK (headcount > 0),
      ADD CONSTRAINT chk_events_state CHECK (state IN ('draft','submitted','approved','in_service','closed'));
  `);

  // event_budget_revisions
  await knex.schema.createTable('event_budget_revisions', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.uuid('event_id').notNullable().references('id').inTable('events').onDelete('RESTRICT');
    t.integer('revision_no').notNullable();
    t.decimal('old_budget_amount', 12, 2).nullable();
    t.decimal('new_budget_amount', 12, 2).notNullable();
    t.decimal('change_percent', 6, 2).nullable();
    t.uuid('changed_by').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.uuid('approval_id').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
    t.unique(['event_id', 'revision_no']);
  });

  // event_service_windows
  await knex.schema.createTable('event_service_windows', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.uuid('event_id').notNullable().references('id').inTable('events').onDelete('RESTRICT');
    t.varchar('label', 100).notNullable();
    t.timestamp('start_at', { useTz: true }).notNullable();
    t.timestamp('end_at', { useTz: true }).notNullable();
  });
  await knex.raw(`
    ALTER TABLE event_service_windows
      ADD CONSTRAINT chk_esw_end_after_start CHECK (end_at > start_at);
  `);

  // event_materials
  await knex.schema.createTable('event_materials', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.uuid('event_id').notNullable().references('id').inTable('events').onDelete('RESTRICT');
    t.varchar('material_type', 20).notNullable();
    t.uuid('recipe_version_id').nullable();
    t.uuid('rental_resource_id').nullable();
    t.decimal('display_quantity', 10, 2).notNullable();
    t.varchar('unit', 50).nullable();
  });
  await knex.raw(`
    ALTER TABLE event_materials
      ADD CONSTRAINT chk_em_material_type CHECK (material_type IN ('recipe','rental'));
  `);

  // event_resource_requests
  await knex.schema.createTable('event_resource_requests', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.uuid('event_id').notNullable().references('id').inTable('events').onDelete('RESTRICT');
    t.uuid('resource_id').notNullable();
    t.integer('quantity').notNullable();
    t.varchar('status', 20).defaultTo('pending');
    t.text('policy_exception_note').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
  });
  await knex.raw(`
    ALTER TABLE event_resource_requests
      ADD CONSTRAINT chk_err_quantity CHECK (quantity > 0);
  `);

  // event_checkins
  await knex.schema.createTable('event_checkins', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.uuid('event_id').notNullable().references('id').inTable('events').onDelete('RESTRICT');
    t.varchar('attendee_label', 200).notNullable();
    t.timestamp('checked_in_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
    t.uuid('checked_in_by').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.uuid('window_id').nullable().references('id').inTable('event_service_windows').onDelete('RESTRICT');
    t.boolean('outside_window').defaultTo(false);
    t.boolean('over_cap').defaultTo(false);
    t.text('over_cap_reason').nullable();
  });

  // ------------------------------------------------------------------
  // 3. APPROVALS
  // ------------------------------------------------------------------

  await knex.schema.createTable('approvals', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.uuid('event_id').notNullable().references('id').inTable('events').onDelete('RESTRICT');
    t.varchar('approval_type', 30).notNullable();
    t.varchar('status', 20).notNullable().defaultTo('pending');
    t.uuid('requested_by').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.uuid('first_approver_id').nullable().references('id').inTable('users').onDelete('RESTRICT');
    t.uuid('second_approver_id').nullable().references('id').inTable('users').onDelete('RESTRICT');
    t.boolean('requires_second_approval').defaultTo(false);
    t.text('justification').nullable();
    t.decimal('old_amount', 12, 2).nullable();
    t.decimal('new_amount', 12, 2).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
    t.timestamp('decided_at', { useTz: true }).nullable();
  });
  await knex.raw(`
    ALTER TABLE approvals
      ADD CONSTRAINT chk_approvals_type CHECK (approval_type IN ('budget_override','budget_change','special_resource','quota_override','overtime')),
      ADD CONSTRAINT chk_approvals_status CHECK (status IN ('pending','approved','rejected'));
  `);

  // Now back-reference approval_id FK on event_budget_revisions
  await knex.raw(`
    ALTER TABLE event_budget_revisions
      ADD CONSTRAINT fk_ebr_approval_id FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE RESTRICT;
  `);

  // ------------------------------------------------------------------
  // 4. RESOURCE CATALOG + METADATA TEMPLATES
  // ------------------------------------------------------------------

  // metadata_templates
  await knex.schema.createTable('metadata_templates', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.varchar('resource_type', 50).notNullable();
    t.jsonb('required_fields_json').defaultTo('[]');
    t.jsonb('validation_rules_json').defaultTo('{}');
    t.integer('version').defaultTo(1);
    t.varchar('status', 20).defaultTo('draft');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
  });
  await knex.raw(`
    ALTER TABLE metadata_templates
      ADD CONSTRAINT chk_mt_status CHECK (status IN ('draft','published','unpublished'));
  `);

  // resources
  await knex.schema.createTable('resources', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.uuid('parent_id').nullable().references('id').inTable('resources').onDelete('RESTRICT');
    t.varchar('name', 200).notNullable();
    t.varchar('resource_type', 50).notNullable();
    t.uuid('template_id').nullable().references('id').inTable('metadata_templates').onDelete('RESTRICT');
    t.jsonb('metadata_json').defaultTo('{}');
    t.boolean('requires_approval').defaultTo(false);
    t.integer('quota_per_event').nullable();
    t.integer('version').defaultTo(1);
    t.varchar('status', 20).defaultTo('draft');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
  });
  await knex.raw(`
    ALTER TABLE resources
      ADD CONSTRAINT chk_resources_status CHECK (status IN ('draft','published','unpublished'));
  `);

  // resource_tags (junction — CASCADE)
  await knex.schema.createTable('resource_tags', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.uuid('resource_id').notNullable().references('id').inTable('resources').onDelete('CASCADE');
    t.varchar('tag', 100).notNullable();
    t.unique(['resource_id', 'tag']);
  });

  // resource_training_links
  await knex.schema.createTable('resource_training_links', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.uuid('resource_id').notNullable().references('id').inTable('resources').onDelete('RESTRICT');
    t.varchar('course_ref', 200).nullable();
    t.varchar('grade_level', 50).nullable();
    t.varchar('subject_area', 100).nullable();
  });

  // ------------------------------------------------------------------
  // 5. RESERVATIONS
  // ------------------------------------------------------------------

  await knex.schema.createTable('reservations', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.uuid('event_id').notNullable().references('id').inTable('events').onDelete('RESTRICT');
    t.uuid('resource_id').notNullable();
    t.varchar('status', 20).notNullable().defaultTo('requested');
    t.timestamp('scheduled_start_at', { useTz: true }).notNullable();
    t.timestamp('scheduled_end_at', { useTz: true }).notNullable();
    t.timestamp('actual_start_at', { useTz: true }).nullable();
    t.timestamp('actual_end_at', { useTz: true }).nullable();
    t.integer('occupancy_count').defaultTo(0);
    t.integer('overtime_minutes').defaultTo(0);
    t.text('overtime_justification').nullable();
    t.boolean('overtime_pending_approval').defaultTo(false);
    t.uuid('overtime_approved_by').nullable().references('id').inTable('users').onDelete('RESTRICT');
    t.timestamp('overtime_approved_at', { useTz: true }).nullable();
    t.uuid('created_by').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
  });
  await knex.raw(`
    ALTER TABLE reservations
      ADD CONSTRAINT chk_reservations_status CHECK (status IN ('requested','approved','released','occupied','returned','cancelled','rescheduled','renewed'));
  `);

  // ------------------------------------------------------------------
  // 6. POLICY EXCEPTIONS
  // ------------------------------------------------------------------

  await knex.schema.createTable('policy_exceptions', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.uuid('event_id').notNullable().references('id').inTable('events').onDelete('RESTRICT');
    t.uuid('resource_id').notNullable().references('id').inTable('resources').onDelete('RESTRICT');
    t.integer('requested_quantity').notNullable();
    t.integer('quota_per_event').notNullable();
    t.text('note').notNullable();
    t.uuid('requested_by').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.uuid('approval_id').nullable().references('id').inTable('approvals').onDelete('RESTRICT');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
  });

  // ------------------------------------------------------------------
  // 7. RECIPES AND VERSIONS
  // ------------------------------------------------------------------

  // recipes (current_version_id FK added after recipe_versions exists)
  await knex.schema.createTable('recipes', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.varchar('slug', 200).unique().notNullable();
    t.uuid('current_version_id').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
  });

  // recipe_versions
  await knex.schema.createTable('recipe_versions', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.uuid('recipe_id').notNullable().references('id').inTable('recipes').onDelete('RESTRICT');
    t.integer('version_no').notNullable();
    t.varchar('title', 200).notNullable();
    t.jsonb('steps_json').defaultTo('[]');
    t.jsonb('quantities_json').defaultTo('[]');
    t.varchar('difficulty', 20).nullable();
    t.integer('time_estimate_minutes').nullable();
    t.jsonb('tags_json').defaultTo('[]');
    t.text('rich_text_html').nullable();
    t.varchar('status', 30).defaultTo('draft');
    t.uuid('approved_by').nullable().references('id').inTable('users').onDelete('RESTRICT');
    t.timestamp('approved_at', { useTz: true }).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
    t.unique(['recipe_id', 'version_no']);
  });
  await knex.raw(`
    ALTER TABLE recipe_versions
      ADD CONSTRAINT chk_rv_status CHECK (status IN ('draft','submitted_for_review','approved','rejected'));
  `);

  // Add deferred FK from recipes -> recipe_versions
  await knex.raw(`
    ALTER TABLE recipes
      ADD CONSTRAINT fk_recipes_current_version_id FOREIGN KEY (current_version_id) REFERENCES recipe_versions(id) ON DELETE RESTRICT;
  `);

  // Add deferred FKs from event_materials -> recipe_versions, resources
  await knex.raw(`
    ALTER TABLE event_materials
      ADD CONSTRAINT fk_em_recipe_version_id FOREIGN KEY (recipe_version_id) REFERENCES recipe_versions(id) ON DELETE RESTRICT,
      ADD CONSTRAINT fk_em_rental_resource_id FOREIGN KEY (rental_resource_id) REFERENCES resources(id) ON DELETE RESTRICT;
  `);

  // Add deferred FK from event_resource_requests -> resources
  await knex.raw(`
    ALTER TABLE event_resource_requests
      ADD CONSTRAINT fk_err_resource_id FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE RESTRICT;
  `);

  // Add deferred FK from reservations -> resources
  await knex.raw(`
    ALTER TABLE reservations
      ADD CONSTRAINT fk_reservations_resource_id FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE RESTRICT;
  `);

  // ------------------------------------------------------------------
  // 8. INVENTORY AND SNAPSHOTS
  // ------------------------------------------------------------------

  await knex.schema.createTable('inventory_items', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.varchar('name', 200).notNullable();
    t.varchar('kind', 20).notNullable();
    t.varchar('unit', 50).notNullable();
    t.decimal('current_quantity', 12, 2).defaultTo(0);
    t.decimal('current_unit_price', 12, 2).defaultTo(0);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
  });
  await knex.raw(`
    ALTER TABLE inventory_items
      ADD CONSTRAINT chk_ii_kind CHECK (kind IN ('ingredient','rental'));
  `);

  await knex.schema.createTable('inventory_snapshots', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.uuid('item_id').notNullable().references('id').inTable('inventory_items').onDelete('RESTRICT');
    t.date('snapshot_date').notNullable();
    t.decimal('quantity', 12, 2).notNullable();
    t.decimal('unit_price', 12, 2).notNullable();
    t.timestamp('recorded_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
    t.unique(['item_id', 'snapshot_date']);
  });

  await knex.schema.createTable('inventory_gap_resolutions', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.uuid('item_id').notNullable().references('id').inTable('inventory_items').onDelete('RESTRICT');
    t.date('missing_date').notNullable();
    t.uuid('resolved_by').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.timestamp('resolved_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
    t.text('notes').nullable();
  });

  // ------------------------------------------------------------------
  // 9. ENTITLEMENTS AND REDEMPTION
  // ------------------------------------------------------------------

  await knex.schema.createTable('entitlement_types', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.varchar('code', 100).unique().notNullable();
    t.varchar('name', 200).notNullable();
    t.varchar('unit', 50).nullable();
    t.boolean('active').defaultTo(true);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
  });

  await knex.schema.createTable('entitlement_issuance_rules', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.varchar('name', 200).notNullable();
    t.varchar('trigger_event', 50).notNullable().defaultTo('event_approved');
    t.uuid('entitlement_type_id').notNullable().references('id').inTable('entitlement_types').onDelete('RESTRICT');
    t.varchar('quantity_formula', 200).notNullable();
    t.boolean('active').defaultTo(true);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
  });

  await knex.schema.createTable('entitlements', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.uuid('event_id').notNullable().references('id').inTable('events').onDelete('RESTRICT');
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.uuid('entitlement_type_id').notNullable().references('id').inTable('entitlement_types').onDelete('RESTRICT');
    t.decimal('quantity_total', 10, 2).notNullable();
    t.decimal('quantity_remaining', 10, 2).notNullable();
    t.timestamp('expires_at', { useTz: true }).nullable();
    t.uuid('issued_by').nullable().references('id').inTable('users').onDelete('RESTRICT');
    t.varchar('issuance_mode', 20).notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
  });
  await knex.raw(`
    ALTER TABLE entitlements
      ADD CONSTRAINT chk_entitlements_issuance_mode CHECK (issuance_mode IN ('auto','manual','bulk_import'));
  `);

  await knex.schema.createTable('redemption_records', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.uuid('entitlement_id').notNullable().references('id').inTable('entitlements').onDelete('RESTRICT');
    t.uuid('event_id').notNullable().references('id').inTable('events').onDelete('RESTRICT');
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.decimal('quantity', 10, 2).notNullable();
    t.uuid('idempotency_key').notNullable();
    t.varchar('result_status', 20).notNullable();
    t.text('failure_reason').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
  });
  await knex.raw(`
    CREATE UNIQUE INDEX idx_redemption_records_idempotency
      ON redemption_records (entitlement_id, idempotency_key);
  `);

  await knex.schema.createTable('bulk_import_batches', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.uuid('uploaded_attachment_id').nullable();
    t.uuid('created_by').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.varchar('status', 20).defaultTo('pending');
    t.jsonb('summary_json').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
  });

  // ------------------------------------------------------------------
  // 10. ATTACHMENTS AND MEDIA
  // ------------------------------------------------------------------

  await knex.schema.createTable('attachments', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.uuid('event_id').nullable().references('id').inTable('events').onDelete('RESTRICT');
    t.uuid('recipe_version_id').nullable().references('id').inTable('recipe_versions').onDelete('RESTRICT');
    t.varchar('original_name', 500).notNullable();
    t.varchar('mime_type', 100).notNullable();
    t.integer('size_bytes').notNullable();
    t.varchar('sha256_hex', 64).notNullable();
    t.text('storage_path').notNullable();
    t.jsonb('variants_json').defaultTo('{}');
    t.uuid('uploaded_by').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
  });

  // Back-reference from bulk_import_batches -> attachments
  await knex.raw(`
    ALTER TABLE bulk_import_batches
      ADD CONSTRAINT fk_bib_uploaded_attachment_id FOREIGN KEY (uploaded_attachment_id) REFERENCES attachments(id) ON DELETE RESTRICT;
  `);

  // ------------------------------------------------------------------
  // 11. AUDIT AND OPS
  // ------------------------------------------------------------------

  // audit_trail
  await knex.schema.createTable('audit_trail', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.uuid('event_id').nullable().references('id').inTable('events').onDelete('RESTRICT');
    t.varchar('subject_type', 50).notNullable();
    t.uuid('subject_id').notNullable();
    t.varchar('action', 50).notNullable();
    t.uuid('actor_user_id').nullable().references('id').inTable('users').onDelete('RESTRICT');
    t.jsonb('before_json').nullable();
    t.jsonb('after_json').nullable();
    t.text('notes').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
  });
  await knex.raw(`
    CREATE INDEX idx_audit_trail_subject ON audit_trail (subject_type, subject_id);
  `);
  await knex.raw(`
    CREATE INDEX idx_audit_trail_event_id ON audit_trail (event_id);
  `);
  await knex.raw(`
    CREATE INDEX idx_audit_trail_created_at ON audit_trail (created_at);
  `);

  // Protect audit_trail from UPDATE and DELETE
  await knex.raw(`
    CREATE OR REPLACE FUNCTION prevent_audit_trail_mutation()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'UPDATE and DELETE are not allowed on audit_trail';
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await knex.raw(`
    CREATE TRIGGER trg_audit_trail_no_update
      BEFORE UPDATE ON audit_trail
      FOR EACH ROW EXECUTE FUNCTION prevent_audit_trail_mutation();
  `);
  await knex.raw(`
    CREATE TRIGGER trg_audit_trail_no_delete
      BEFORE DELETE ON audit_trail
      FOR EACH ROW EXECUTE FUNCTION prevent_audit_trail_mutation();
  `);

  // backup_runs
  await knex.schema.createTable('backup_runs', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.timestamp('started_at', { useTz: true }).notNullable();
    t.timestamp('ended_at', { useTz: true }).nullable();
    t.varchar('status', 20).notNullable();
    t.text('artifact_path').nullable();
    t.boolean('restore_tested').defaultTo(false);
    t.text('notes').nullable();
  });

  // drill_runs
  await knex.schema.createTable('drill_runs', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.uuid('backup_run_id').notNullable().references('id').inTable('backup_runs').onDelete('RESTRICT');
    t.varchar('drill_quarter', 10).notNullable();
    t.timestamp('started_at', { useTz: true }).nullable();
    t.timestamp('ended_at', { useTz: true }).nullable();
    t.varchar('status', 20).nullable();
    t.varchar('restored_db_name', 100).nullable();
    t.jsonb('verification_json').nullable();
    t.uuid('executed_by').nullable().references('id').inTable('users').onDelete('RESTRICT');
    t.text('notes').nullable();
  });

  // data_collection_jobs
  await knex.schema.createTable('data_collection_jobs', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.varchar('source_name', 200).notNullable();
    t.varchar('status', 20).defaultTo('pending');
    t.text('proxy_used').nullable();
    t.text('user_agent').nullable();
    t.jsonb('redirect_chain_json').nullable();
    t.jsonb('cookies_json').nullable();
    t.text('result_ref').nullable();
    t.boolean('manual_review_required').defaultTo(false);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
  });

  // report_exports
  await knex.schema.createTable('report_exports', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.varchar('report_type', 50).notNullable();
    t.text('file_path').notNullable();
    t.uuid('created_by').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.varchar('parameters_hash', 64).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
  });

  // manager_event_scopes
  await knex.schema.createTable('manager_event_scopes', (t) => {
    t.uuid('id').primary().defaultTo(UUID_DEFAULT(knex));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.uuid('event_id').notNullable().references('id').inTable('events').onDelete('RESTRICT');
    t.uuid('assigned_by').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(NOW_DEFAULT(knex));
    t.unique(['user_id', 'event_id']);
  });

  // ------------------------------------------------------------------
  // 12. Apply updated_at triggers to all relevant tables
  // ------------------------------------------------------------------

  for (const tableName of TABLES_WITH_UPDATED_AT) {
    await knex.raw(`
      CREATE TRIGGER trg_${tableName}_updated_at
        BEFORE UPDATE ON "${tableName}"
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);
  }
}

// ===========================  DOWN  ========================================
export async function down(knex) {
  // Drop triggers first
  for (const tableName of TABLES_WITH_UPDATED_AT) {
    await knex.raw(`DROP TRIGGER IF EXISTS trg_${tableName}_updated_at ON "${tableName}";`);
  }

  // Drop audit_trail protection triggers
  await knex.raw(`DROP TRIGGER IF EXISTS trg_audit_trail_no_update ON audit_trail;`);
  await knex.raw(`DROP TRIGGER IF EXISTS trg_audit_trail_no_delete ON audit_trail;`);

  // Drop tables in reverse dependency order
  const tables = [
    'manager_event_scopes',
    'report_exports',
    'data_collection_jobs',
    'drill_runs',
    'backup_runs',
    'audit_trail',
    'attachments',
    'bulk_import_batches',
    'redemption_records',
    'entitlements',
    'entitlement_issuance_rules',
    'entitlement_types',
    'inventory_gap_resolutions',
    'inventory_snapshots',
    'inventory_items',
    'policy_exceptions',
    'event_checkins',
    'event_resource_requests',
    'event_materials',
    'event_service_windows',
    'event_budget_revisions',
    'reservations',
    'recipe_versions',
    'recipes',
    'resource_training_links',
    'resource_tags',
    'resources',
    'metadata_templates',
    'approvals',
    'events',
    'refresh_tokens',
    'role_permissions',
    'user_roles',
    'permissions',
    'roles',
    'users',
  ];

  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }

  // Drop functions
  await knex.raw('DROP FUNCTION IF EXISTS set_updated_at();');
  await knex.raw('DROP FUNCTION IF EXISTS prevent_audit_trail_mutation();');
}
