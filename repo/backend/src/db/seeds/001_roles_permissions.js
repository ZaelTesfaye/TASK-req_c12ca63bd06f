/**
 * 001_roles_permissions.js
 *
 * Seed roles, permissions, and role_permissions mappings.
 * Uses onConflict().ignore() for idempotent re-runs.
 */

import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Data definitions
// ---------------------------------------------------------------------------

const ROLES = [
  'event_planner',
  'resource_manager',
  'culinary_editor',
  'inventory_analyst',
  'approver',
  'admin',
];

const PERMISSIONS = [
  'auth:self',
  'event:create',
  'event:read',
  'event:update',
  'event:submit',
  'event:approve',
  'event:service',
  'event:close',
  'budget:override',
  'resource:request',
  'resource:manage',
  'resource:approve_special',
  'resource:quota_override',
  'reservation:read',
  'reservation:request',
  'reservation:approve',
  'reservation:operate',
  'reservation:overtime_approve',
  'recipe:create',
  'recipe:review',
  'recipe:approve',
  'inventory:read',
  'inventory:resolve_gap',
  'inventory:export',
  'entitlement:issue_auto',
  'entitlement:issue_manual',
  'entitlement:bulk_import',
  'entitlement:redeem',
  'attachment:upload',
  'attachment:read',
  'audit:read',
  'reports:export',
  'ops:cache_admin',
  'ops:backup_admin',
  'ops:data_collection_admin',
  'admin:roles',
  'admin:manager_scope',
  'admin:audit',
];

const ROLE_PERMISSION_MAP = {
  event_planner: [
    'event:create',
    'event:read',
    'event:update',
    'event:submit',
    'resource:request',
    'reservation:read',
    'attachment:upload',
    'attachment:read',
    'reports:export',
    'entitlement:redeem',
  ],
  resource_manager: [
    'event:read',
    'event:service',
    'event:close',
    'resource:manage',
    'reservation:read',
    'reservation:request',
    'reservation:approve',
    'reservation:operate',
    'attachment:read',
  ],
  culinary_editor: [
    'recipe:create',
    'recipe:review',
    'attachment:upload',
    'attachment:read',
  ],
  inventory_analyst: [
    'inventory:read',
    'inventory:resolve_gap',
    'inventory:export',
    'reports:export',
  ],
  approver: [
    'event:read',
    'event:approve',
    'budget:override',
    'resource:approve_special',
    'resource:quota_override',
    'reservation:read',
    'reservation:overtime_approve',
    'recipe:approve',
    'audit:read',
    'reports:export',
  ],
  admin: [...PERMISSIONS], // ALL permissions
};

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

export async function seed(knex) {
  // 1. Insert roles
  const roleRows = ROLES.map((name) => ({ id: uuidv4(), name }));
  await knex('roles').insert(roleRows).onConflict('name').ignore();

  // 2. Insert permissions
  const permRows = PERMISSIONS.map((code) => ({ id: uuidv4(), code }));
  await knex('permissions').insert(permRows).onConflict('code').ignore();

  // 3. Fetch the authoritative IDs from the database (may already exist)
  const dbRoles = await knex('roles').select('id', 'name');
  const dbPerms = await knex('permissions').select('id', 'code');

  const roleIdByName = Object.fromEntries(dbRoles.map((r) => [r.name, r.id]));
  const permIdByCode = Object.fromEntries(dbPerms.map((p) => [p.code, p.id]));

  // 4. Build role_permissions junction rows
  const rpRows = [];
  for (const [roleName, permCodes] of Object.entries(ROLE_PERMISSION_MAP)) {
    const roleId = roleIdByName[roleName];
    if (!roleId) continue;

    for (const code of permCodes) {
      const permissionId = permIdByCode[code];
      if (!permissionId) continue;
      rpRows.push({ role_id: roleId, permission_id: permissionId });
    }
  }

  if (rpRows.length > 0) {
    await knex('role_permissions')
      .insert(rpRows)
      .onConflict(['role_id', 'permission_id'])
      .ignore();
  }
}
