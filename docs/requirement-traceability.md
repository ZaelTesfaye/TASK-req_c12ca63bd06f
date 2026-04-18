# Requirement Traceability Matrix

This document maps each prompt requirement to its implementation across backend files, frontend files, and tests.

---

## Legend

- **B** = Backend source file (under `backend/src/`)
- **F** = Frontend source file (under `frontend/src/`)
- **T** = Test file (under `backend/tests/` or `frontend/tests/`)

---

## 1. Local Username/Password Sign-In

| Aspect | Files |
|---|---|
| **B: Auth endpoints** | `auth/routes.js` (POST `/auth/login`, POST `/auth/register`, POST `/auth/refresh`, POST `/auth/logout`, GET `/auth/me`) |
| **B: Password hashing** | `auth/routes.js` (argon2id hashing and verification) |
| **B: JWT token generation** | `auth/routes.js` (access token 45min, refresh token 10 days, rotation on refresh) |
| **B: Authentication middleware** | `middleware/authenticate.js` (Bearer token verification, user payload extraction) |
| **B: Config** | `config/index.js` (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL_MINUTES`, `JWT_REFRESH_TTL_DAYS`) |
| **F: Login page** | `routes/login/+page.svelte` |
| **F: Register page** | `routes/register/+page.svelte` |
| **F: Auth store** | `lib/auth/`, `lib/stores/` |
| **T: Backend** | `tests/api/auth.test.js` |
| **T: Frontend** | `tests/unit/auth-store.test.js`, `tests/e2e/login.test.js` |

---

## 2. Role-Based Screens

Roles: Event Planner, Resource Manager, Culinary Editor, Inventory Analyst, Approver, Administrator.

| Aspect | Files |
|---|---|
| **B: Role definitions** | `db/seeds/001_roles_permissions.js` (role and permission seed data) |
| **B: Role assignment** | `modules/roles/routes.js`, `modules/roles/repository.js` |
| **B: User-role mapping** | `modules/users/routes.js`, `modules/users/repository.js` |
| **B: Permission enforcement** | `middleware/authorize.js` (permission-based preHandler factory) |
| **B: Admin role management** | `modules/roles/routes.js` (under `/admin/*`) |
| **F: Dashboard** | `routes/dashboard/+page.svelte` (role-appropriate widgets and navigation) |
| **F: Route guards** | `lib/auth/`, `routes/+layout.svelte` |
| **F: Admin panel** | `routes/admin/+page.svelte` |
| **T: Backend** | `tests/api/authorization.test.js`, `tests/api/admin.test.js` |
| **T: Frontend** | `tests/unit/permissions.test.js`, `tests/unit/route-guards.test.js` |

---

## 3. Event State Machine (Draft -> Submitted -> Approved -> In Service -> Closed)

| Aspect | Files |
|---|---|
| **B: State transitions** | `modules/events/service.js` (state machine logic with valid transition map) |
| **B: Event CRUD** | `modules/events/routes.js`, `modules/events/repository.js` |
| **B: State validation** | `modules/events/service.js` (enforces valid state transitions, rejects invalid ones) |
| **F: Event detail** | `routes/events/[id]/+page.svelte` (state transition buttons, status display) |
| **F: Event list** | `routes/events/+page.svelte` (status filter badges) |
| **T: Backend** | `tests/unit/state-machine.test.js`, `tests/api/events.test.js` |
| **T: Frontend** | `tests/unit/state-rendering.test.js`, `tests/e2e/events.test.js` |

---

## 4. Budget Cap $25,000 and Override

| Aspect | Files |
|---|---|
| **B: Budget validation** | `modules/events/service.js` (enforces $25,000 cap, override flag support) |
| **B: Budget rules** | `modules/events/service.js` (business rule enforcement on create/update) |
| **F: Event form** | `routes/events/new/+page.svelte`, `routes/events/[id]/+page.svelte` (budget input with cap warning) |
| **T: Backend** | `tests/unit/budget-rules.test.js`, `tests/api/events.test.js` |

---

## 5. >10% Budget Change Approval

| Aspect | Files |
|---|---|
| **B: Change detection** | `modules/events/service.js` (compares new budget to previous, triggers approval if delta exceeds 10%) |
| **B: Approval creation** | `modules/approvals/service.js`, `modules/approvals/routes.js` |
| **B: Approval workflow** | `modules/approvals/repository.js` |
| **F: Approval queue** | `routes/approvals/+page.svelte` |
| **T: Backend** | `tests/unit/budget-rules.test.js`, `tests/api/approvals.test.js` |

---

## 6. Service Windows (Multiple per Event)

| Aspect | Files |
|---|---|
| **B: Service window management** | `modules/events/service.js`, `modules/events/repository.js` (CRUD for service windows linked to events) |
| **B: Event routes** | `modules/events/routes.js` (nested service window endpoints) |
| **F: Event detail** | `routes/events/[id]/+page.svelte` (service window list, add/edit forms) |
| **T: Backend** | `tests/api/events.test.js` |

---

## 7. Resource Requests with Special Resource Approval

| Aspect | Files |
|---|---|
| **B: Resource request handling** | `modules/events/service.js` (resource requests within events) |
| **B: Special resource flag** | `modules/resources/routes.js`, `modules/resources/repository.js` (special resource catalog entries) |
| **B: Approval trigger** | `modules/approvals/service.js` (auto-creates approval for special resources) |
| **F: Event detail** | `routes/events/[id]/+page.svelte` (resource request form with special flag indicator) |
| **F: Catalog** | `routes/catalog/+page.svelte` (resource browser with special resource marking) |
| **T: Backend** | `tests/api/events.test.js`, `tests/api/approvals.test.js` |

---

## 8. Over-Quota Policy Exception

| Aspect | Files |
|---|---|
| **B: Quota enforcement** | `modules/entitlements/service.js` (quota check on issuance and redemption) |
| **B: Exception handling** | `modules/entitlements/service.js` (policy exception flag, justification required) |
| **B: Approval routing** | `modules/approvals/service.js` (over-quota exceptions route to approval queue) |
| **F: Entitlements** | `routes/entitlements/+page.svelte` (exception request form) |
| **T: Backend** | `tests/api/entitlements.test.js` |

---

## 9. Timeline-Style Process Logs

| Aspect | Files |
|---|---|
| **B: Audit trail** | `shared/audit.js` (writes structured events to `audit_trail` table) |
| **B: Audit query** | `modules/audit/routes.js` (GET endpoint for timeline retrieval) |
| **B: Event logging** | `modules/events/service.js` (audit calls on every state transition) |
| **F: Event detail** | `routes/events/[id]/+page.svelte` (timeline display component) |
| **T: Backend** | `tests/api/events.test.js` |

---

## 10. Attachments (SHA-256, 25 MB, Allowlist)

| Aspect | Files |
|---|---|
| **B: Upload handling** | `modules/attachments/routes.js`, `modules/attachments/service.js` |
| **B: SHA-256 hashing** | `modules/attachments/service.js` (computes SHA-256 digest on upload, stores in DB) |
| **B: Size limit** | `config/index.js` (`UPLOAD_MAX_MB=25`), enforced in routes |
| **B: MIME allowlist** | `config/index.js` (`UPLOAD_ALLOWED_MIME`), `modules/attachments/service.js` (validation) |
| **B: File storage** | `modules/attachments/repository.js` (metadata), filesystem at `UPLOAD_ROOT` |
| **F: Event detail** | `routes/events/[id]/+page.svelte` (file upload widget) |
| **T: Backend** | `tests/unit/attachment-validation.test.js`, `tests/api/attachments.test.js` |

---

## 11. Reservation Lifecycle (Request -> Approve -> Release -> Occupy -> Return)

| Aspect | Files |
|---|---|
| **B: Reservation state machine** | `modules/reservations/service.js` (state transitions: requested, approved, released, occupied, returned) |
| **B: Reservation CRUD** | `modules/reservations/routes.js`, `modules/reservations/repository.js` |
| **F: Reservations** | `routes/reservations/+page.svelte` (lifecycle management with state transitions) |
| **T: Backend** | `tests/api/reservations.test.js` |

---

## 12. Overtime >30min Justification and Approval

| Aspect | Files |
|---|---|
| **B: Overtime detection** | `modules/reservations/service.js` (compares actual return time to scheduled end) |
| **B: Justification requirement** | `modules/reservations/service.js` (requires justification text when overtime exceeds 30 minutes) |
| **B: Approval routing** | `modules/approvals/service.js` (overtime events route to approval queue) |
| **F: Reservations** | `routes/reservations/+page.svelte` (overtime justification form) |
| **T: Backend** | `tests/unit/overtime.test.js`, `tests/api/reservations.test.js` |

---

## 13. Recipe Versioning and Review Workflow

| Aspect | Files |
|---|---|
| **B: Recipe CRUD + versioning** | `modules/recipes/routes.js`, `modules/recipes/service.js`, `modules/recipes/repository.js` |
| **B: Version tracking** | `modules/recipes/service.js` (auto-increment version on update, previous version preserved) |
| **B: Review workflow** | `modules/recipes/service.js` (draft -> submitted -> approved/rejected states) |
| **B: Approval integration** | `modules/approvals/service.js` (recipe review items in approval queue) |
| **F: Recipe list** | `routes/recipes/+page.svelte` (version history display) |
| **F: Recipe detail** | `routes/recipes/[id]/+page.svelte` (edit form, review status, version diff) |
| **T: Backend** | `tests/api/recipes.test.js` |

---

## 14. Inventory Snapshots with Anomaly and Gap Detection

| Aspect | Files |
|---|---|
| **B: Snapshot generation** | `modules/inventory/service.js` (scheduled and on-demand snapshots) |
| **B: Anomaly detection** | `modules/inventory/service.js` (compares consecutive snapshots, flags significant deviations) |
| **B: Gap detection** | `modules/inventory/service.js` (identifies missing items between expected and actual counts) |
| **B: Scheduled snapshots** | `plugins/scheduler.js` (runs on `SNAPSHOT_CRON` schedule) |
| **F: Inventory** | `routes/inventory/+page.svelte` (snapshot viewer, anomaly alerts, gap report) |
| **T: Backend** | `tests/api/inventory.test.js` |

---

## 15. Resource Catalog Unified Tree

| Aspect | Files |
|---|---|
| **B: Catalog tree** | `modules/resources/routes.js`, `modules/resources/repository.js` (hierarchical resource structure) |
| **B: Cache** | `plugins/cache.js` (`catalog:tree` key, 24h TTL, invalidated on resource mutations) |
| **F: Catalog browser** | `routes/catalog/+page.svelte` (tree navigation, search, filter) |
| **T: Backend** | `tests/unit/catalog-validation.test.js` |

---

## 16. Entitlement Auto/Manual/Bulk Issuance

| Aspect | Files |
|---|---|
| **B: Issuance modes** | `modules/entitlements/service.js` (automatic rule-based, manual single, bulk batch issuance) |
| **B: Entitlement types and rules** | `db/seeds/003_entitlement_types_rules.js`, `modules/entitlements/repository.js` |
| **B: Entitlement routes** | `modules/entitlements/routes.js` |
| **F: Entitlements** | `routes/entitlements/+page.svelte` (issuance forms, bulk upload) |
| **T: Backend** | `tests/api/entitlements.test.js` |

---

## 17. Idempotent Redemption

| Aspect | Files |
|---|---|
| **B: Idempotency enforcement** | `modules/entitlements/service.js` (idempotency key check, prevents double-redemption) |
| **B: Redemption endpoint** | `modules/entitlements/routes.js` (POST with idempotency key header) |
| **T: Backend** | `tests/unit/entitlement-redemption.test.js`, `tests/api/entitlements.test.js` |

---

## 18. Sensitive Field Encryption and Masking

| Aspect | Files |
|---|---|
| **B: AES-256-GCM encryption** | `shared/encryption.js` (`encrypt()`, `decrypt()` functions) |
| **B: Field masking** | `shared/encryption.js` (`maskField()` for employee_id, phone, email display) |
| **B: Key configuration** | `config/index.js` (`ENCRYPTION_KEY_HEX`, validated as 64 hex chars) |
| **B: Key rotation cleanup** | `plugins/scheduler.js` (runs on `KEY_CLEANUP_CRON`) |
| **T: Backend** | `tests/unit/encryption.test.js` |

---

## 19. Anti-Crawling Data Collection Subsystem

| Aspect | Files |
|---|---|
| **B: Data collection routes** | `modules/data-collection/routes.js` |
| **B: Data collection service** | `modules/data-collection/service.js` (proxy rotation, user agent cycling, cookie handling -- all stubbed when `DRY_RUN_EXTERNAL_STUBS=true`) |
| **B: Dry-run mode** | `config/index.js` (`DRY_RUN_EXTERNAL_STUBS`) |
| **T: Backend** | Covered by stub behavior validation in API tests |

---

## 20. Cache with Invalidation Policies

| Aspect | Files |
|---|---|
| **B: Cache provider** | `plugins/cache.js` (Redis and in-memory modes) |
| **B: Cache keys and TTLs** | `plugins/cache.js` (`CACHE_KEYS`, `CACHE_TTLS` -- catalog:tree 24h, recipes:approved 1h, inventory:snapshot 30m, entitlement:types 1h, events:list 5m) |
| **B: Mutation-triggered invalidation** | Event/recipe/inventory/entitlement services call `cacheDel()` or `cacheDelPattern()` on writes |
| **B: Cache admin** | `modules/admin-cache-routes.js` (stats, purge endpoints) |
| **B: Config** | `config/index.js` (`REDIS_URL`, `CACHE_MODE`) |

---

## 21. Image Resizing / Transcoding

| Aspect | Files |
|---|---|
| **B: Image processor** | `plugins/image-processor.js` (Sharp-based) |
| **B: Variant generation** | `plugins/image-processor.js` (thumb: 200x200, preview: 600x600, full: 1200x1200, all JPEG output) |
| **B: MIME validation** | `plugins/image-processor.js` (`isImageMime()` for jpeg, png, webp, gif, tiff, avif, svg) |
| **B: Integration** | `modules/attachments/service.js` (triggers variant generation for image uploads) |

---

## 22. Optional SSR

| Aspect | Files |
|---|---|
| **B: SSR flag** | `config/index.js` (`ENABLE_SSR`, default `false`) |
| **F: SSR configuration** | `routes/+layout.js` (controls SSR behavior based on configuration) |
| **T: Backend** | `tests/unit/config.test.js` |

---

## 23. Circuit Breaking

| Aspect | Files |
|---|---|
| **B: Circuit breaker plugin** | `plugins/circuit-breaker.js` (opossum-based, named breakers with registry) |
| **B: Configuration** | `config/index.js` (`CB_TIMEOUT_MS`, `CB_ERROR_THRESHOLD_PERCENT`, `CB_ROLLING_WINDOW_MS`, `CB_RESET_TIMEOUT_MS`) |
| **B: State logging** | `plugins/circuit-breaker.js` (logs open/halfOpen/close transitions, fallback triggers) |
| **B: Fallback** | `plugins/circuit-breaker.js` (returns `ServiceTemporarilyUnavailable` when circuit is open) |

---

## 24. Scheduled Backups and Quarterly Drills

| Aspect | Files |
|---|---|
| **B: Backup service** | `modules/backup/service.js` (pg_dump execution, file management) |
| **B: Backup routes** | `modules/backup/routes.js` (trigger, list, drill endpoints under `/admin/backups/*`) |
| **B: Retention policy** | `config/index.js` (`BACKUP_RETENTION_DAYS=30`), `modules/backup/service.js` (cleanup logic) |
| **B: Drill recording** | `modules/backup/service.js` (writes to `drill_runs` table) |
| **B: Scheduled execution** | `plugins/scheduler.js` (`SNAPSHOT_CRON` triggers nightly backup) |
| **F: Admin panel** | `routes/admin/+page.svelte` (backup management, drill recording UI) |

---

## 25. Tablet-Optimized Check-In

| Aspect | Files |
|---|---|
| **B: Check-in endpoints** | `modules/checkin/routes.js`, `modules/checkin/service.js`, `modules/checkin/repository.js` |
| **F: Check-in page** | `routes/check-in/+page.svelte` (large touch targets 48px+, high-contrast dark theme) |
| **F: Check-in layout** | `routes/check-in/+layout.svelte` (dedicated layout, landscape-optimized) |
| **T: Backend** | `tests/api/checkin.test.js` |
| **T: Frontend** | `tests/e2e/checkin.test.js` |

---

## 26. Immutable Audit Trails

| Aspect | Files |
|---|---|
| **B: Audit writer** | `shared/audit.js` (`writeAudit()` inserts into `audit_trail` table) |
| **B: Audit schema** | `db/migrations/001_initial_schema.js` (audit_trail table: event_id, subject_type, subject_id, action, actor_user_id, before, after, notes, created_at) |
| **B: Audit query** | `modules/audit/routes.js` (read-only retrieval, no update/delete endpoints) |
| **B: Integration** | All service modules call `writeAudit()` on state changes (events, approvals, reservations, recipes, entitlements, backups) |
| **B: Immutability** | No UPDATE or DELETE endpoints exist for audit trail records |

---

## Coverage Summary

| Requirement | Backend | Frontend | Tests |
|---|:---:|:---:|:---:|
| Local username/password sign-in | Yes | Yes | Yes |
| Role-based screens | Yes | Yes | Yes |
| Event state machine | Yes | Yes | Yes |
| Budget cap $25,000 and override | Yes | Yes | Yes |
| >10% budget change approval | Yes | Yes | Yes |
| Service windows | Yes | Yes | Yes |
| Resource requests with special approval | Yes | Yes | Yes |
| Over-quota policy exception | Yes | Yes | Yes |
| Timeline-style process logs | Yes | Yes | Partial |
| Attachments (SHA-256, 25MB, allowlist) | Yes | Yes | Yes |
| Reservation lifecycle | Yes | Yes | Yes |
| Overtime >30min justification | Yes | Yes | Yes |
| Recipe versioning and review | Yes | Yes | Yes |
| Inventory snapshots + anomaly/gap | Yes | Yes | Yes |
| Resource catalog unified tree | Yes | Yes | Yes |
| Entitlement auto/manual/bulk issuance | Yes | Yes | Yes |
| Idempotent redemption | Yes | -- | Yes |
| Sensitive field encryption/masking | Yes | -- | Yes |
| Anti-crawling data collection | Yes (stub) | -- | Partial |
| Cache with invalidation | Yes | -- | -- |
| Image resizing/transcoding | Yes | -- | -- |
| Optional SSR | Yes | Yes | Yes |
| Circuit breaking | Yes | -- | -- |
| Scheduled backups + quarterly drills | Yes | Yes | -- |
| Tablet-optimized check-in | Yes | Yes | Yes |
| Immutable audit trails | Yes | -- | -- |
