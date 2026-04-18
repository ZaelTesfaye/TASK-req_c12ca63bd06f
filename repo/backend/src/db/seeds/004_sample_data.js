/**
 * 004_sample_data.js
 *
 * Seed sample catalog data for development and testing:
 *   - Metadata templates (Venue, Catering, Equipment)
 *   - Resource tree with hierarchical categories and leaf resources
 *   - Inventory items (ingredients and rentals) with historical snapshots
 *
 * Uses onConflict().ignore() for idempotent re-runs.
 */

import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Deterministic IDs so we can reference parents during the same seed run
// ---------------------------------------------------------------------------

const IDS = {
  // Templates
  tplVenue: uuidv4(),
  tplCatering: uuidv4(),
  tplEquipment: uuidv4(),

  // Resource tree
  venues: uuidv4(),
  ballroom: uuidv4(),
  ballroomA: uuidv4(),
  ballroomB: uuidv4(),
  catering: uuidv4(),
  kitchenA: uuidv4(),
  equipment: uuidv4(),
  avEquipment: uuidv4(),
  projector: uuidv4(),
  soundSystem: uuidv4(),

  // Inventory items
  flour: uuidv4(),
  chicken: uuidv4(),
  oliveOil: uuidv4(),
  tables: uuidv4(),
  chairs: uuidv4(),
};

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

export async function seed(knex) {
  // -----------------------------------------------------------------------
  // 1. Metadata Templates
  // -----------------------------------------------------------------------

  const templates = [
    {
      id: IDS.tplVenue,
      resource_type: 'Venue',
      required_fields_json: JSON.stringify([
        'capacity',
        'floor',
        'has_av',
      ]),
      validation_rules_json: JSON.stringify({
        capacity: { type: 'integer', min: 1 },
        floor: { type: 'string' },
        has_av: { type: 'boolean' },
      }),
      version: 1,
      status: 'published',
    },
    {
      id: IDS.tplCatering,
      resource_type: 'Catering',
      required_fields_json: JSON.stringify([
        'kitchen_type',
        'max_covers',
      ]),
      validation_rules_json: JSON.stringify({
        kitchen_type: { type: 'string', enum: ['hot', 'cold', 'pastry'] },
        max_covers: { type: 'integer', min: 1 },
      }),
      version: 1,
      status: 'published',
    },
    {
      id: IDS.tplEquipment,
      resource_type: 'Equipment',
      required_fields_json: JSON.stringify([
        'brand',
        'model',
      ]),
      validation_rules_json: JSON.stringify({
        brand: { type: 'string' },
        model: { type: 'string' },
      }),
      version: 1,
      status: 'published',
    },
  ];

  for (const tpl of templates) {
    const exists = await knex('metadata_templates')
      .where({ resource_type: tpl.resource_type, version: tpl.version })
      .first();
    if (!exists) {
      await knex('metadata_templates').insert(tpl);
    }
  }

  // -----------------------------------------------------------------------
  // 2. Resource Tree
  // -----------------------------------------------------------------------

  const resources = [
    // Top-level categories
    {
      id: IDS.venues,
      parent_id: null,
      name: 'Venues',
      resource_type: 'Venue',
      template_id: IDS.tplVenue,
      metadata_json: JSON.stringify({}),
      requires_approval: false,
      quota_per_event: null,
      version: 1,
      status: 'published',
    },
    {
      id: IDS.catering,
      parent_id: null,
      name: 'Catering',
      resource_type: 'Catering',
      template_id: IDS.tplCatering,
      metadata_json: JSON.stringify({}),
      requires_approval: false,
      quota_per_event: null,
      version: 1,
      status: 'published',
    },
    {
      id: IDS.equipment,
      parent_id: null,
      name: 'Equipment',
      resource_type: 'Equipment',
      template_id: IDS.tplEquipment,
      metadata_json: JSON.stringify({}),
      requires_approval: false,
      quota_per_event: null,
      version: 1,
      status: 'published',
    },

    // Venues > Ballroom (sub-category)
    {
      id: IDS.ballroom,
      parent_id: IDS.venues,
      name: 'Ballroom',
      resource_type: 'Venue',
      template_id: IDS.tplVenue,
      metadata_json: JSON.stringify({}),
      requires_approval: false,
      quota_per_event: null,
      version: 1,
      status: 'published',
    },

    // Venues > Ballroom > Ballroom A
    {
      id: IDS.ballroomA,
      parent_id: IDS.ballroom,
      name: 'Ballroom A',
      resource_type: 'Venue',
      template_id: IDS.tplVenue,
      metadata_json: JSON.stringify({
        capacity: 300,
        floor: 'Ground',
        has_av: true,
      }),
      requires_approval: false,
      quota_per_event: null,
      version: 1,
      status: 'published',
    },

    // Venues > Ballroom > Ballroom B
    {
      id: IDS.ballroomB,
      parent_id: IDS.ballroom,
      name: 'Ballroom B',
      resource_type: 'Venue',
      template_id: IDS.tplVenue,
      metadata_json: JSON.stringify({
        capacity: 200,
        floor: 'Ground',
        has_av: false,
      }),
      requires_approval: false,
      quota_per_event: null,
      version: 1,
      status: 'published',
    },

    // Catering > Kitchen A
    {
      id: IDS.kitchenA,
      parent_id: IDS.catering,
      name: 'Kitchen A',
      resource_type: 'Catering',
      template_id: IDS.tplCatering,
      metadata_json: JSON.stringify({
        kitchen_type: 'hot',
        max_covers: 500,
      }),
      requires_approval: false,
      quota_per_event: null,
      version: 1,
      status: 'published',
    },

    // Equipment > AV Equipment (sub-category)
    {
      id: IDS.avEquipment,
      parent_id: IDS.equipment,
      name: 'AV Equipment',
      resource_type: 'Equipment',
      template_id: IDS.tplEquipment,
      metadata_json: JSON.stringify({}),
      requires_approval: false,
      quota_per_event: null,
      version: 1,
      status: 'published',
    },

    // Equipment > AV Equipment > Projector (requires_approval: true)
    {
      id: IDS.projector,
      parent_id: IDS.avEquipment,
      name: 'Projector',
      resource_type: 'Equipment',
      template_id: IDS.tplEquipment,
      metadata_json: JSON.stringify({
        brand: 'Epson',
        model: 'EB-L1750U',
      }),
      requires_approval: true,
      quota_per_event: null,
      version: 1,
      status: 'published',
    },

    // Equipment > AV Equipment > Sound System (quota_per_event: 5)
    {
      id: IDS.soundSystem,
      parent_id: IDS.avEquipment,
      name: 'Sound System',
      resource_type: 'Equipment',
      template_id: IDS.tplEquipment,
      metadata_json: JSON.stringify({
        brand: 'JBL',
        model: 'VTX A12',
      }),
      requires_approval: false,
      quota_per_event: 5,
      version: 1,
      status: 'published',
    },
  ];

  for (const res of resources) {
    const exists = await knex('resources')
      .where({ name: res.name, resource_type: res.resource_type })
      .first();
    if (!exists) {
      await knex('resources').insert(res);
    }
  }

  // -----------------------------------------------------------------------
  // 3. Inventory Items
  // -----------------------------------------------------------------------

  const inventoryItems = [
    // Ingredients
    {
      id: IDS.flour,
      name: 'Flour',
      kind: 'ingredient',
      unit: 'kg',
      current_quantity: 250.0,
      current_unit_price: 1.5,
    },
    {
      id: IDS.chicken,
      name: 'Chicken',
      kind: 'ingredient',
      unit: 'kg',
      current_quantity: 120.0,
      current_unit_price: 8.0,
    },
    {
      id: IDS.oliveOil,
      name: 'Olive Oil',
      kind: 'ingredient',
      unit: 'liter',
      current_quantity: 80.0,
      current_unit_price: 12.0,
    },

    // Rentals
    {
      id: IDS.tables,
      name: 'Tables',
      kind: 'rental',
      unit: 'unit',
      current_quantity: 50.0,
      current_unit_price: 25.0,
    },
    {
      id: IDS.chairs,
      name: 'Chairs',
      kind: 'rental',
      unit: 'unit',
      current_quantity: 300.0,
      current_unit_price: 5.0,
    },
  ];

  for (const item of inventoryItems) {
    const exists = await knex('inventory_items')
      .where({ name: item.name, kind: item.kind })
      .first();
    if (!exists) {
      await knex('inventory_items').insert(item);
    }
  }

  // -----------------------------------------------------------------------
  // 4. Inventory Snapshots (past 7 days)
  // -----------------------------------------------------------------------

  // Fetch actual item IDs from DB in case they were inserted in a prior run
  const dbItems = await knex('inventory_items').select('id', 'name');
  const itemIdByName = Object.fromEntries(dbItems.map((i) => [i.name, i.id]));

  const snapshotItems = [
    { name: 'Flour', baseQty: 250, basePrice: 1.5 },
    { name: 'Chicken', baseQty: 120, basePrice: 8.0 },
    { name: 'Olive Oil', baseQty: 80, basePrice: 12.0 },
    { name: 'Tables', baseQty: 50, basePrice: 25.0 },
    { name: 'Chairs', baseQty: 300, basePrice: 5.0 },
  ];

  const snapshotRows = [];
  const today = new Date();

  for (let daysAgo = 7; daysAgo >= 1; daysAgo--) {
    const snapshotDate = new Date(today);
    snapshotDate.setDate(today.getDate() - daysAgo);
    const dateStr = snapshotDate.toISOString().slice(0, 10);

    for (const si of snapshotItems) {
      const itemId = itemIdByName[si.name];
      if (!itemId) continue;

      // Simulate small daily fluctuations
      const variance = 1 + (daysAgo % 3 - 1) * 0.02; // +/- 2%
      const quantity = parseFloat((si.baseQty * variance).toFixed(2));
      const unitPrice = parseFloat((si.basePrice * variance).toFixed(2));

      snapshotRows.push({
        id: uuidv4(),
        item_id: itemId,
        snapshot_date: dateStr,
        quantity,
        unit_price: unitPrice,
      });
    }
  }

  if (snapshotRows.length > 0) {
    await knex('inventory_snapshots')
      .insert(snapshotRows)
      .onConflict(['item_id', 'snapshot_date'])
      .ignore();
  }
}
