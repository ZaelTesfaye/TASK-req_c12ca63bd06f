/**
 * Unit tests for permissions constants.
 * Source: src/lib/constants/permissions.js
 */
import { describe, it, expect } from 'vitest';
import {
  ALL_PERMISSIONS,
  PERMISSION_GROUPS,
  AUTH_SELF,
  EVENT_CREATE,
  EVENT_READ,
  EVENT_UPDATE,
  EVENT_SUBMIT,
  EVENT_APPROVE,
  EVENT_SERVICE,
  EVENT_CLOSE,
  BUDGET_OVERRIDE,
  RESOURCE_REQUEST,
  RESOURCE_MANAGE,
  RESOURCE_APPROVE_SPECIAL,
  RESOURCE_QUOTA_OVERRIDE,
  RESERVATION_REQUEST,
  RESERVATION_APPROVE,
  RESERVATION_OPERATE,
  RESERVATION_OVERTIME_APPROVE,
  RECIPE_CREATE,
  RECIPE_REVIEW,
  RECIPE_APPROVE,
  INVENTORY_READ,
  INVENTORY_RESOLVE_GAP,
  INVENTORY_EXPORT,
  ENTITLEMENT_ISSUE_AUTO,
  ENTITLEMENT_ISSUE_MANUAL,
  ENTITLEMENT_BULK_IMPORT,
  ENTITLEMENT_REDEEM,
  ATTACHMENT_UPLOAD,
  ATTACHMENT_READ,
  AUDIT_READ,
  REPORTS_EXPORT,
  OPS_CACHE_ADMIN,
  OPS_BACKUP_ADMIN,
  OPS_DATA_COLLECTION_ADMIN,
  ADMIN_ROLES,
  ADMIN_MANAGER_SCOPE
} from '../../src/lib/constants/permissions.js';

// ---------------------------------------------------------------------------
// ALL_PERMISSIONS
// ---------------------------------------------------------------------------
describe('ALL_PERMISSIONS', () => {
  it('is an array', () => {
    expect(Array.isArray(ALL_PERMISSIONS)).toBe(true);
  });

  it('contains exactly 36 permission codes', () => {
    expect(ALL_PERMISSIONS).toHaveLength(36);
  });

  it('contains no duplicate permissions', () => {
    const uniqueSet = new Set(ALL_PERMISSIONS);
    expect(uniqueSet.size).toBe(ALL_PERMISSIONS.length);
  });

  it('all entries are non-empty strings', () => {
    for (const perm of ALL_PERMISSIONS) {
      expect(typeof perm).toBe('string');
      expect(perm.length).toBeGreaterThan(0);
    }
  });

  it('every entry follows the "domain:action" convention', () => {
    for (const perm of ALL_PERMISSIONS) {
      expect(perm).toMatch(/^[a-z_]+:[a-z_]+$/);
    }
  });

  it('includes specific well-known permissions', () => {
    expect(ALL_PERMISSIONS).toContain('auth:self');
    expect(ALL_PERMISSIONS).toContain('event:create');
    expect(ALL_PERMISSIONS).toContain('event:approve');
    expect(ALL_PERMISSIONS).toContain('admin:roles');
    expect(ALL_PERMISSIONS).toContain('inventory:read');
    expect(ALL_PERMISSIONS).toContain('entitlement:redeem');
  });
});

// ---------------------------------------------------------------------------
// PERMISSION_GROUPS
// ---------------------------------------------------------------------------
describe('PERMISSION_GROUPS', () => {
  it('is a non-null object', () => {
    expect(PERMISSION_GROUPS).toBeDefined();
    expect(typeof PERMISSION_GROUPS).toBe('object');
  });

  it('has expected group names', () => {
    const expectedGroups = [
      'auth',
      'events',
      'budget',
      'resources',
      'reservations',
      'recipes',
      'inventory',
      'entitlements',
      'attachments',
      'audit',
      'reports',
      'operations',
      'admin'
    ];
    const groupNames = Object.keys(PERMISSION_GROUPS);
    for (const name of expectedGroups) {
      expect(groupNames).toContain(name);
    }
    expect(groupNames).toHaveLength(expectedGroups.length);
  });

  it('auth group contains AUTH_SELF', () => {
    expect(PERMISSION_GROUPS.auth).toContain(AUTH_SELF);
  });

  it('events group contains all event permissions', () => {
    const eventsGroup = PERMISSION_GROUPS.events;
    expect(eventsGroup).toContain(EVENT_CREATE);
    expect(eventsGroup).toContain(EVENT_READ);
    expect(eventsGroup).toContain(EVENT_UPDATE);
    expect(eventsGroup).toContain(EVENT_SUBMIT);
    expect(eventsGroup).toContain(EVENT_APPROVE);
    expect(eventsGroup).toContain(EVENT_SERVICE);
    expect(eventsGroup).toContain(EVENT_CLOSE);
    expect(eventsGroup).toHaveLength(7);
  });

  it('resources group contains all resource permissions', () => {
    const group = PERMISSION_GROUPS.resources;
    expect(group).toContain(RESOURCE_REQUEST);
    expect(group).toContain(RESOURCE_MANAGE);
    expect(group).toContain(RESOURCE_APPROVE_SPECIAL);
    expect(group).toContain(RESOURCE_QUOTA_OVERRIDE);
    expect(group).toHaveLength(4);
  });

  it('reservations group contains all reservation permissions', () => {
    const group = PERMISSION_GROUPS.reservations;
    expect(group).toContain(RESERVATION_REQUEST);
    expect(group).toContain(RESERVATION_APPROVE);
    expect(group).toContain(RESERVATION_OPERATE);
    expect(group).toContain(RESERVATION_OVERTIME_APPROVE);
    expect(group).toHaveLength(4);
  });

  it('recipes group contains all recipe permissions', () => {
    const group = PERMISSION_GROUPS.recipes;
    expect(group).toContain(RECIPE_CREATE);
    expect(group).toContain(RECIPE_REVIEW);
    expect(group).toContain(RECIPE_APPROVE);
    expect(group).toHaveLength(3);
  });

  it('inventory group contains all inventory permissions', () => {
    const group = PERMISSION_GROUPS.inventory;
    expect(group).toContain(INVENTORY_READ);
    expect(group).toContain(INVENTORY_RESOLVE_GAP);
    expect(group).toContain(INVENTORY_EXPORT);
    expect(group).toHaveLength(3);
  });

  it('entitlements group contains all entitlement permissions', () => {
    const group = PERMISSION_GROUPS.entitlements;
    expect(group).toContain(ENTITLEMENT_ISSUE_AUTO);
    expect(group).toContain(ENTITLEMENT_ISSUE_MANUAL);
    expect(group).toContain(ENTITLEMENT_BULK_IMPORT);
    expect(group).toContain(ENTITLEMENT_REDEEM);
    expect(group).toHaveLength(4);
  });

  it('admin group contains admin permissions', () => {
    const group = PERMISSION_GROUPS.admin;
    expect(group).toContain(ADMIN_ROLES);
    expect(group).toContain(ADMIN_MANAGER_SCOPE);
    expect(group).toHaveLength(2);
  });

  it('operations group contains ops permissions', () => {
    const group = PERMISSION_GROUPS.operations;
    expect(group).toContain(OPS_CACHE_ADMIN);
    expect(group).toContain(OPS_BACKUP_ADMIN);
    expect(group).toContain(OPS_DATA_COLLECTION_ADMIN);
    expect(group).toHaveLength(3);
  });

  it('every permission in groups is also in ALL_PERMISSIONS', () => {
    for (const [, perms] of Object.entries(PERMISSION_GROUPS)) {
      for (const perm of perms) {
        expect(ALL_PERMISSIONS).toContain(perm);
      }
    }
  });

  it('the total of all group permissions equals ALL_PERMISSIONS length', () => {
    const totalFromGroups = Object.values(PERMISSION_GROUPS).reduce(
      (sum, arr) => sum + arr.length,
      0
    );
    expect(totalFromGroups).toBe(ALL_PERMISSIONS.length);
  });
});
