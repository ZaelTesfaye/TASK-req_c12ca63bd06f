/**
 * 002_demo_users.js
 *
 * Seed demo users for each role.
 * Passwords are hashed with argon2 (argon2id variant).
 * Uses onConflict().ignore() for idempotent re-runs.
 */

import argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Demo user definitions
// ---------------------------------------------------------------------------

const DEMO_USERS = [
  { username: 'admin', password: 'admin123!', roleName: 'admin' },
  { username: 'planner', password: 'planner123!', roleName: 'event_planner' },
  { username: 'manager', password: 'manager123!', roleName: 'resource_manager' },
  { username: 'chef', password: 'chef123!', roleName: 'culinary_editor' },
  { username: 'analyst', password: 'analyst123!', roleName: 'inventory_analyst' },
  { username: 'approver', password: 'approver123!', roleName: 'approver' },
];

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

export async function seed(knex) {
  // Demo users ship well-known development passwords. Refuse to seed them
  // into a production database — operators must provision real accounts via
  // /auth/register + /admin/roles/assign instead.
  if (process.env.NODE_ENV === 'production') {
    // eslint-disable-next-line no-console
    console.warn('[seed 002_demo_users] Skipping demo user seed in NODE_ENV=production');
    return;
  }

  // Pre-fetch role IDs
  const dbRoles = await knex('roles').select('id', 'name');
  const roleIdByName = Object.fromEntries(dbRoles.map((r) => [r.name, r.id]));

  for (const { username, password, roleName } of DEMO_USERS) {
    // Check if user already exists
    const existing = await knex('users').where({ username }).first();
    if (existing) {
      // Ensure role assignment exists even if the user was already created
      const roleId = roleIdByName[roleName];
      if (roleId) {
        await knex('user_roles')
          .insert({ user_id: existing.id, role_id: roleId })
          .onConflict(['user_id', 'role_id'])
          .ignore();
      }
      continue;
    }

    // Hash password with argon2id
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    const userId = uuidv4();
    await knex('users').insert({
      id: userId,
      username,
      password_hash: passwordHash,
      status: 'active',
    });

    // Assign role
    const roleId = roleIdByName[roleName];
    if (roleId) {
      await knex('user_roles')
        .insert({ user_id: userId, role_id: roleId })
        .onConflict(['user_id', 'role_id'])
        .ignore();
    }
  }
}
