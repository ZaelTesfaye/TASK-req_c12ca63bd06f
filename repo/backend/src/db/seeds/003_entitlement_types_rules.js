/**
 * 003_entitlement_types_rules.js
 *
 * Seed entitlement types and the default issuance rule.
 * Uses onConflict().ignore() for idempotent re-runs.
 */

import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Data definitions
// ---------------------------------------------------------------------------

const ENTITLEMENT_TYPES = [
  { code: 'staff_meal', name: 'Staff Meal', unit: 'meal' },
  { code: 'venue_hour', name: 'Venue Hour', unit: 'hour' },
  { code: 'equipment_unit', name: 'Equipment Unit', unit: 'unit' },
];

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

export async function seed(knex) {
  // 1. Insert entitlement types
  const typeRows = ENTITLEMENT_TYPES.map((et) => ({
    id: uuidv4(),
    code: et.code,
    name: et.name,
    unit: et.unit,
    active: true,
  }));

  await knex('entitlement_types')
    .insert(typeRows)
    .onConflict('code')
    .ignore();

  // 2. Fetch the staff_meal type ID from the database
  const staffMealType = await knex('entitlement_types')
    .where({ code: 'staff_meal' })
    .first();

  if (!staffMealType) {
    return; // Should not happen, but guard against it
  }

  // 3. Insert default issuance rule
  //    Check if it already exists by name to maintain idempotency
  const existingRule = await knex('entitlement_issuance_rules')
    .where({ name: '10 staff meals per event role' })
    .first();

  if (!existingRule) {
    await knex('entitlement_issuance_rules').insert({
      id: uuidv4(),
      name: '10 staff meals per event role',
      trigger_event: 'event_approved',
      entitlement_type_id: staffMealType.id,
      quantity_formula: '10_per_role',
      active: true,
    });
  }
}
