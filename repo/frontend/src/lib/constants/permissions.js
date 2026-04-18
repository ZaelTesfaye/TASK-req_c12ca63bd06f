/**
 * Permission codes matching the backend authorization system.
 * These are used to gate UI visibility and API access.
 */

// Auth
export const AUTH_SELF = 'auth:self';

// Events
export const EVENT_CREATE = 'event:create';
export const EVENT_READ = 'event:read';
export const EVENT_UPDATE = 'event:update';
export const EVENT_SUBMIT = 'event:submit';
export const EVENT_APPROVE = 'event:approve';
export const EVENT_SERVICE = 'event:service';
export const EVENT_CLOSE = 'event:close';

// Budget
export const BUDGET_OVERRIDE = 'budget:override';

// Resources
export const RESOURCE_REQUEST = 'resource:request';
export const RESOURCE_MANAGE = 'resource:manage';
export const RESOURCE_APPROVE_SPECIAL = 'resource:approve_special';
export const RESOURCE_QUOTA_OVERRIDE = 'resource:quota_override';

// Reservations
export const RESERVATION_REQUEST = 'reservation:request';
export const RESERVATION_APPROVE = 'reservation:approve';
export const RESERVATION_OPERATE = 'reservation:operate';
export const RESERVATION_OVERTIME_APPROVE = 'reservation:overtime_approve';

// Recipes
export const RECIPE_CREATE = 'recipe:create';
export const RECIPE_REVIEW = 'recipe:review';
export const RECIPE_APPROVE = 'recipe:approve';

// Inventory
export const INVENTORY_READ = 'inventory:read';
export const INVENTORY_RESOLVE_GAP = 'inventory:resolve_gap';
export const INVENTORY_EXPORT = 'inventory:export';

// Entitlements
export const ENTITLEMENT_ISSUE_AUTO = 'entitlement:issue_auto';
export const ENTITLEMENT_ISSUE_MANUAL = 'entitlement:issue_manual';
export const ENTITLEMENT_BULK_IMPORT = 'entitlement:bulk_import';
export const ENTITLEMENT_REDEEM = 'entitlement:redeem';

// Attachments
export const ATTACHMENT_UPLOAD = 'attachment:upload';
export const ATTACHMENT_READ = 'attachment:read';

// Audit
export const AUDIT_READ = 'audit:read';

// Reports
export const REPORTS_EXPORT = 'reports:export';

// Operations
export const OPS_CACHE_ADMIN = 'ops:cache_admin';
export const OPS_BACKUP_ADMIN = 'ops:backup_admin';
export const OPS_DATA_COLLECTION_ADMIN = 'ops:data_collection_admin';

// Admin
export const ADMIN_ROLES = 'admin:roles';
export const ADMIN_MANAGER_SCOPE = 'admin:manager_scope';

/**
 * All permission codes as an array for iteration/validation.
 */
export const ALL_PERMISSIONS = [
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
];

/**
 * Permission groups for UI organization.
 */
export const PERMISSION_GROUPS = {
  auth: [AUTH_SELF],
  events: [EVENT_CREATE, EVENT_READ, EVENT_UPDATE, EVENT_SUBMIT, EVENT_APPROVE, EVENT_SERVICE, EVENT_CLOSE],
  budget: [BUDGET_OVERRIDE],
  resources: [RESOURCE_REQUEST, RESOURCE_MANAGE, RESOURCE_APPROVE_SPECIAL, RESOURCE_QUOTA_OVERRIDE],
  reservations: [RESERVATION_REQUEST, RESERVATION_APPROVE, RESERVATION_OPERATE, RESERVATION_OVERTIME_APPROVE],
  recipes: [RECIPE_CREATE, RECIPE_REVIEW, RECIPE_APPROVE],
  inventory: [INVENTORY_READ, INVENTORY_RESOLVE_GAP, INVENTORY_EXPORT],
  entitlements: [ENTITLEMENT_ISSUE_AUTO, ENTITLEMENT_ISSUE_MANUAL, ENTITLEMENT_BULK_IMPORT, ENTITLEMENT_REDEEM],
  attachments: [ATTACHMENT_UPLOAD, ATTACHMENT_READ],
  audit: [AUDIT_READ],
  reports: [REPORTS_EXPORT],
  operations: [OPS_CACHE_ADMIN, OPS_BACKUP_ADMIN, OPS_DATA_COLLECTION_ADMIN],
  admin: [ADMIN_ROLES, ADMIN_MANAGER_SCOPE]
};
