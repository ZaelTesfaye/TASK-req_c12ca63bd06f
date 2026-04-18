# Static Audit Report (`audit-report-3.md`)

## 1. Verdict

- **Overall conclusion:** **Partial Pass**

## 2. Scope and Static Verification Boundary

- **Reviewed:** repository structure, docs/config/scripts, backend Fastify route/service/repository modules, frontend Svelte routes/stores/api usage, migrations/seeds, backend + frontend test code and test configs.
- **Excluded from evidence:** `./.tmp/**` and generated artifacts.
- **Not executed by design:** app startup, Docker, database, tests, browser flows, external integrations.
- **Manual verification required for runtime-dependent claims:** scheduler execution, backup artifact generation/restore, actual upload/transcoding on disk, cache behavior under load, circuit-breaker tripping behavior.

## 3. Repository / Requirement Mapping Summary

- **Prompt core goal mapped:** on-prem hospitality operations platform combining events, approvals, reservations, recipes, inventory, entitlements, attachments, auditability, and operational controls.
- **Core flows mapped to implementation:**
  - Event lifecycle + budget/approval gates (`backend/src/modules/events/*`, `backend/src/modules/approvals/*`).
  - Reservation lifecycle + overtime approval (`backend/src/modules/reservations/*`).
  - Recipe draft/review/approved workflow (`backend/src/modules/recipes/*`).
  - Inventory anomalies/gaps + report block on unresolved gaps (`backend/src/modules/inventory/*`, `backend/src/modules/reports/*`).
  - Entitlement issue/redeem/idempotency (`backend/src/modules/entitlements/*`).
  - Attachments with size/type/hash (`backend/src/modules/attachments/*`).
  - RBAC/auth (`backend/src/auth/routes.js`, `backend/src/middleware/*`).

## 4. Section-by-section Review

### 1. Hard Gates

#### 1.1 Documentation and static verifiability

- **Conclusion:** **Partial Pass**
- **Rationale:** README is comprehensive and mostly consistent, but test command documentation conflicts with backend script aliasing.
- **Evidence:** `repo/README.md:168`, `repo/README.md:182`, `repo/README.md:185`, `repo/backend/package.json:12`
- **Manual verification:** Runtime startup/test success cannot be confirmed statically.

#### 1.2 Material deviation from Prompt

- **Conclusion:** **Fail**
- **Rationale:** Several Prompt-critical operational capabilities are implemented but not initialized in runtime entrypoints; one security control for attachment parent scoping is missing on upload path.
- **Evidence:** `repo/backend/src/server.js:14`, `repo/backend/src/app.js:166`, `repo/backend/src/plugins/cache.js:61`, `repo/backend/src/plugins/scheduler.js:40`, `repo/backend/src/modules/attachments/routes.js:99`, `repo/backend/src/modules/attachments/routes.js:179`

### 2. Delivery Completeness

#### 2.1 Core functional requirement coverage

- **Conclusion:** **Partial Pass**
- **Rationale:** Most core domains are implemented end-to-end; major gaps remain in operational runtime wiring and sensitive-field encryption/masking application.
- **Evidence:**
  - Implemented flows: `repo/backend/src/modules/events/service.js:21`, `repo/backend/src/modules/events/service.js:27`, `repo/backend/src/modules/reservations/service.js:246`, `repo/backend/src/modules/recipes/service.js:181`, `repo/backend/src/modules/reports/service.js:104`, `repo/backend/src/modules/entitlements/service.js:372`, `repo/backend/src/modules/attachments/service.js:49`
  - Gaps: `repo/backend/src/server.js:14`, `repo/backend/src/plugins/scheduler.js:40`, `repo/backend/src/db/migrations/001_initial_schema.js:55`, `repo/backend/src/shared/encryption.js:24`, `repo/backend/src/modules/users/repository.js:27`

#### 2.2 Basic end-to-end 0-to-1 deliverable

- **Conclusion:** **Pass**
- **Rationale:** Coherent fullstack structure with backend/frontend modules, database schema/seeds, and test suites.
- **Evidence:** `repo/README.md:287`, `repo/backend/src/app.js:148`, `repo/frontend/src/routes/events/+page.svelte:1`, `repo/backend/tests/integration/auth.integration.test.js:24`, `repo/frontend/tests/unit/route-guards.test.js:1`

### 3. Engineering and Architecture Quality

#### 3.1 Structure and module decomposition

- **Conclusion:** **Pass**
- **Rationale:** Backend follows route/service/repository boundaries; frontend uses route-based pages with shared stores/utils/components.
- **Evidence:** `repo/README.md:88`, `repo/backend/src/modules/events/routes.js:1`, `repo/backend/src/modules/events/service.js:1`, `repo/backend/src/modules/events/repository.js:1`, `repo/frontend/src/lib/stores/auth.js:1`

#### 3.2 Maintainability and extensibility

- **Conclusion:** **Partial Pass**
- **Rationale:** Generally maintainable structure, but critical operational plugins are disconnected from startup and some contracts are inconsistent.
- **Evidence:** `repo/backend/src/plugins/scheduler.js:40`, `repo/backend/src/server.js:20`, `repo/backend/src/modules/inventory/routes.js:227`, `repo/backend/src/modules/inventory/routes.js:237`

### 4. Engineering Details and Professionalism

#### 4.1 Error handling, logging, validation, API design

- **Conclusion:** **Partial Pass**
- **Rationale:** Strong baseline (structured errors, zod validation, centralized logger redaction), but notable API/authorization defects remain.
- **Evidence:** `repo/backend/src/app.js:86`, `repo/backend/src/middleware/validate.js:1`, `repo/backend/src/logging/index.js:20`, `repo/backend/src/modules/attachments/routes.js:99`, `repo/backend/src/modules/inventory/routes.js:227`

#### 4.2 Product-like delivery shape

- **Conclusion:** **Pass**
- **Rationale:** Delivery resembles a real product, with domain modules, RBAC, migrations/seeds, frontend routes, and broad test assets.
- **Evidence:** `repo/README.md:84`, `repo/backend/src/app.js:166`, `repo/frontend/src/routes/+layout.svelte:1`

### 5. Prompt Understanding and Requirement Fit

#### 5.1 Business understanding and constraint fit

- **Conclusion:** **Partial Pass**
- **Rationale:** Core business semantics are mostly implemented; notable misses include attachment object-level write protection, operational runtime activation, and incomplete sensitive-data-at-rest behavior.
- **Evidence:** `repo/backend/src/modules/events/service.js:190`, `repo/backend/src/modules/reservations/service.js:268`, `repo/backend/src/modules/recipes/service.js:212`, `repo/backend/src/modules/attachments/routes.js:99`, `repo/backend/src/server.js:14`, `repo/backend/src/db/migrations/001_initial_schema.js:55`

### 6. Aesthetics (frontend/full-stack)

#### 6.1 Visual/interaction fit

- **Conclusion:** **Cannot Confirm Statistically**
- **Rationale:** Static code shows intended responsive layout/state handling, but final visual quality and interaction polish require runtime/browser verification.
- **Evidence:** `repo/frontend/src/routes/+layout.svelte:473`, `repo/frontend/src/routes/events/+page.svelte:101`, `repo/frontend/src/routes/check-in/+page.svelte:1`
- **Manual verification:** Required for actual rendering, spacing, typography, tablet ergonomics.

## 5. Issues / Suggestions (Severity-Rated)

### Blocker / High

1. **Severity:** High  
   **Title:** Attachment upload lacks object-level parent authorization  
   **Conclusion:** Fail  
   **Evidence:** `repo/backend/src/modules/attachments/routes.js:99`, `repo/backend/src/modules/attachments/routes.js:120`, `repo/backend/src/modules/attachments/routes.js:179`  
   **Impact:** Any user with `attachment:upload` can upload to arbitrary `event_id` / `recipe_version_id` without the parent access checks enforced on read endpoints.  
   **Minimum actionable fix:** Enforce `assertAttachmentParentAccess` (or equivalent write-scope check) before `attachmentsService.upload()` for provided parent references.

2. **Severity:** High  
   **Title:** Cache and scheduler subsystems are not initialized in runtime startup  
   **Conclusion:** Fail  
   **Evidence:** `repo/backend/src/plugins/cache.js:61`, `repo/backend/src/plugins/scheduler.js:40`, `repo/backend/src/server.js:14`, `repo/backend/src/app.js:166`, `repo/backend/tests/unit/scheduler.test.js:122`  
   **Impact:** Claimed HA/ops features (scheduled backups/snapshots/cache warming, active cache backend lifecycle) are likely inactive in normal server execution.  
   **Minimum actionable fix:** Call `initCache()` and `initScheduler()` during bootstrap (with startup error handling and graceful shutdown hooks).

3. **Severity:** High  
   **Title:** Scheduler cache-warm query targets wrong recipe schema columns  
   **Conclusion:** Fail  
   **Evidence:** `repo/backend/src/plugins/scheduler.js:185`, `repo/backend/src/plugins/scheduler.js:187`, `repo/backend/src/plugins/scheduler.js:188`, `repo/backend/src/db/migrations/001_initial_schema.js:340`, `repo/backend/src/db/migrations/001_initial_schema.js:349`, `repo/backend/src/modules/recipes/repository.js:123`  
   **Impact:** Recipe warm job queries non-existent semantics (`recipes.status`, `recipes.name`), so approved-recipe warming path is unreliable/failing.  
   **Minimum actionable fix:** Query approved current versions via join to `recipe_versions` (same approach as repository `findApproved`).

4. **Severity:** High  
   **Title:** Sensitive-field encryption/masking requirement is only scaffolded, not applied in user flows  
   **Conclusion:** Partial Fail  
   **Evidence:** `repo/backend/src/db/migrations/001_initial_schema.js:55`, `repo/backend/src/shared/encryption.js:24`, `repo/backend/src/modules/users/repository.js:27`, `repo/backend/src/auth/routes.js:233`, `repo/backend/src/auth/routes.js:341`  
   **Impact:** Prompt requirement for masking/encryption of sensitive user fields is not demonstrated in operational read/write paths; encryption helper is unused in app modules.  
   **Minimum actionable fix:** Integrate encrypt/decrypt + masking in user create/update/read surfaces (or dedicated profile module) and add tests proving at-rest ciphertext + masked API outputs.

### Medium / Low

5. **Severity:** Medium  
   **Title:** Frontend event search parameter is not supported by backend events list API  
   **Conclusion:** Fail  
   **Evidence:** `repo/frontend/src/routes/events/+page.svelte:33`, `repo/backend/src/modules/events/routes.js:35`, `repo/backend/src/modules/events/repository.js:68`  
   **Impact:** UI exposes search control that does not affect backend query results.  
   **Minimum actionable fix:** Add `search` to backend query schema/repository filtering or remove the unsupported UI parameter.

6. **Severity:** Medium  
   **Title:** Inventory gap-resolve API contract mismatch (`:id` path validated but body `item_id` used)  
   **Conclusion:** Partial Fail  
   **Evidence:** `repo/backend/src/modules/inventory/routes.js:227`, `repo/backend/src/modules/inventory/routes.js:232`, `repo/backend/src/modules/inventory/routes.js:237`  
   **Impact:** Ambiguous API contract increases integration risk and weakens path/body consistency guarantees.  
   **Minimum actionable fix:** Use `:id` as authoritative item id and validate body consistency (or remove path param and make body-only endpoint).

7. **Severity:** Medium  
   **Title:** Check-in navigation permission is mapped to entitlement permission instead of event service permission  
   **Conclusion:** Partial Fail  
   **Evidence:** `repo/frontend/src/routes/+layout.svelte:56`, `repo/frontend/src/lib/constants/permissions.js:15`, `repo/backend/src/modules/checkin/routes.js:51`, `repo/backend/src/db/seeds/001_roles_permissions.js:77`  
   **Impact:** Legitimate service operators can be hidden from check-in navigation despite having backend `event:service` permission.  
   **Minimum actionable fix:** Gate check-in nav on `EVENT_SERVICE` (or route-specific permission set aligned with backend).

8. **Severity:** Low  
   **Title:** Reservation list pagination total may not match scope-filtered data for non-admins  
   **Conclusion:** Partial Fail  
   **Evidence:** `repo/backend/src/modules/reservations/routes.js:129`, `repo/backend/src/modules/reservations/routes.js:144`, `repo/backend/src/modules/reservations/routes.js:156`  
   **Impact:** Pagination metadata can be misleading for scoped users.  
   **Minimum actionable fix:** Apply scope constraints at query level (repository) before computing total.

9. **Severity:** Low  
   **Title:** README/API test command guidance and backend script alias are inconsistent  
   **Conclusion:** Partial Fail  
   **Evidence:** `repo/backend/package.json:12`, `repo/README.md:183`, `repo/README.md:185`  
   **Impact:** Reviewers/developers may run helper-only path and miss integration suite.  
   **Minimum actionable fix:** Align `test:api` script with `tests/integration` or update README/scripts consistently.

## 6. Security Review Summary

- **Authentication entry points:** **Pass**. JWT login/refresh/logout/me flows and auth middleware exist with 401 handling.  
  Evidence: `repo/backend/src/auth/routes.js:281`, `repo/backend/src/auth/routes.js:353`, `repo/backend/src/middleware/authenticate.js:23`.
- **Route-level authorization:** **Partial Pass**. Broad use of `authorize(...)` on protected routes; some routes add state-specific checks.  
  Evidence: `repo/backend/src/modules/events/routes.js:110`, `repo/backend/src/modules/reservations/routes.js:84`, `repo/backend/src/modules/checkin/routes.js:47`.
- **Object-level authorization:** **Partial Pass**. Strong in reservations/check-in/attachment read paths, but missing on attachment upload parent scope.  
  Evidence: `repo/backend/src/modules/reservations/service.js:30`, `repo/backend/src/modules/checkin/service.js:25`, `repo/backend/src/modules/attachments/routes.js:179`, `repo/backend/src/modules/attachments/routes.js:99`.
- **Function-level authorization:** **Pass**. State-specific permission gates and ownership checks exist in critical workflows.  
  Evidence: `repo/backend/src/modules/events/routes.js:247`, `repo/backend/src/modules/events/routes.js:272`, `repo/backend/src/modules/entitlements/service.js:385`.
- **Tenant/user data isolation:** **Partial Pass**. User/event scoping exists for multiple modules; list-level totals and some list queries can be scope-misaligned.  
  Evidence: `repo/backend/src/modules/users/routes.js:87`, `repo/backend/src/modules/reservations/routes.js:131`.
- **Admin/internal/debug protection:** **Pass**. Admin cache, backup, data-collection endpoints are permission-gated.  
  Evidence: `repo/backend/src/modules/admin-cache-routes.js:33`, `repo/backend/src/modules/backup/routes.js:50`, `repo/backend/src/modules/data-collection/routes.js:50`.

## 7. Tests and Logging Review

- **Unit tests:** **Pass** (exist and cover core logic modules).  
  Evidence: `repo/backend/tests/unit/overtime.test.js:104`, `repo/backend/tests/unit/budget-rules.test.js:1`, `repo/backend/tests/unit/reports.test.js:85`, `repo/frontend/tests/unit/route-guards.test.js:82`.
- **API/integration tests:** **Partial Pass** (broad backend integration coverage; specific high-risk gap for attachment upload object auth not covered).  
  Evidence: `repo/backend/tests/integration/auth.integration.test.js:24`, `repo/backend/tests/integration/events.integration.test.js:194`, `repo/backend/tests/integration/reservations-authorization.integration.test.js:85`, `repo/backend/tests/integration/attachments.integration.test.js:68`, `repo/backend/tests/integration/authorization-and-budget-gates.integration.test.js:164`.
- **Logging categories/observability:** **Pass** (structured logger with module/action, centralized error handling).  
  Evidence: `repo/backend/src/logging/index.js:41`, `repo/backend/src/app.js:86`.
- **Sensitive-data leakage risk in logs/responses:** **Partial Pass** (log redaction exists; response surfaces still need explicit sensitive-field masking implementation).  
  Evidence: `repo/backend/src/logging/index.js:20`, `repo/backend/src/logging/index.js:45`, `repo/backend/src/db/migrations/001_initial_schema.js:55`, `repo/backend/src/modules/users/repository.js:27`.

## 8. Test Coverage Assessment (Static Audit)

### 8.1 Test Overview

- **Unit tests:** Yes (`backend/tests/unit`, `frontend/tests/unit`).
- **API/integration tests:** Yes (`backend/tests/integration`).
- **E2E tests:** Yes (`frontend/tests/e2e`, Playwright; mostly mocked intercept flows).
- **Frameworks:** Vitest + Supertest-style Fastify inject + Playwright.
- **Entry points/scripts:**
  - Backend: `repo/backend/package.json:10`, `repo/backend/package.json:11`, `repo/backend/package.json:12`, `repo/backend/vitest.integration.config.js:17`
  - Frontend: `repo/frontend/package.json:10`, `repo/frontend/package.json:11`, `repo/frontend/package.json:12`, `repo/frontend/playwright.config.js:4`
  - README commands: `repo/README.md:168`, `repo/README.md:182`, `repo/README.md:190`

### 8.2 Coverage Mapping Table

| Requirement / Risk Point                                         | Mapped Test Case(s)                                                                                                                                                                                                              | Key Assertion / Fixture / Mock                                                                                    | Coverage Assessment | Gap                                                                               | Minimum Test Addition                                                                                   |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Auth login/refresh/logout/me core flow + auth failures           | `repo/backend/tests/integration/auth.integration.test.js:111`, `...:172`, `...:216`, `...:242`                                                                                                                                   | 401 invalid creds/token assertions at `...:139`, `...:269`                                                        | sufficient          | None major                                                                        | Keep regression coverage for token rotation edge-cases                                                  |
| Event state machine + budget cap/default + >10% pending approval | `repo/backend/tests/integration/events.integration.test.js:194`, `...:68`, `...:388`; `repo/backend/tests/integration/authorization-and-budget-gates.integration.test.js:278`, `...:290`                                         | State assertions `...:243`, `...:260`; pending approval checks `...:440`, `authorization-and-budget-gates...:307` | sufficient          | None major                                                                        | Add explicit negative tests for invalid submit actor and unresolved approvals (if not already indirect) |
| Reservation lifecycle + overtime approval path                   | `repo/backend/tests/integration/reservations-lifecycle.integration.test.js:141`, `...:318`; unit overtime tests `repo/backend/tests/unit/overtime.test.js:140`                                                                   | Overtime pending/approval assertions `...:336`, `...:345`; justification required `overtime.test.js:149`          | sufficient          | None major                                                                        | Add duplicate-submit/re-entrancy tests on transition endpoints                                          |
| Object-level authorization (reservations/check-in)               | `repo/backend/tests/integration/reservations-authorization.integration.test.js:105`, `repo/backend/tests/integration/checkin.integration.test.js:161`                                                                            | 403 assertions for out-of-scope actors                                                                            | basically covered   | Coverage is module-specific, not uniform across all object-owned resources        | Expand table-driven object-scope tests across all parent-child resources                                |
| Attachment access control                                        | `repo/backend/tests/integration/authorization-and-budget-gates.integration.test.js:164`, `...:173`, `...:182`; `repo/backend/tests/integration/attachments.integration.test.js:68`                                               | Read/download 403 checks exist; upload tested only for success                                                    | insufficient        | Missing unauthorized cross-event upload test (the high-risk gap)                  | Add test: user with `attachment:upload` attempts POST to another user�s `event_id` and expect 403       |
| Entitlement idempotent redemption + ownership                    | `repo/backend/tests/integration/entitlements.integration.test.js:136`; `repo/backend/tests/integration/authorization-gaps.integration.test.js:210`                                                                               | Idempotency no-double-decrement and 403 non-owner                                                                 | sufficient          | None major                                                                        | Add rollback-path assertion under injected DB failure                                                   |
| Inventory gap detection/resolution + report-block semantics      | `repo/backend/tests/integration/inventory.integration.test.js:57`, `...:79`; `repo/backend/tests/unit/reports.test.js:86`                                                                                                        | Gap route status assertions, report export blocked on unresolved gaps                                             | basically covered   | Integration test for `/reports/*` route-level behavior not shown in sampled suite | Add API integration tests for report endpoints (success + 409 unresolved gaps)                          |
| Admin/internal endpoint protection                               | `repo/backend/tests/integration/admin.integration.test.js:268`, `repo/backend/tests/integration/data-collection.integration.test.js:60`, `repo/backend/tests/integration/authorization-and-budget-gates.integration.test.js:347` | 403 for non-admin, 401 unauthenticated checks                                                                     | sufficient          | None major                                                                        | Add contract test for backup endpoints unauthorized paths                                               |
| Scheduler/cache runtime activation                               | Unit-only scheduler/cache tests: `repo/backend/tests/unit/scheduler.test.js:122`, `repo/backend/tests/unit/cache.test.js:110`                                                                                                    | Plugin functions tested in isolation only                                                                         | missing             | No startup integration test proving bootstrap calls init functions                | Add integration test asserting startup path calls cache/scheduler init hooks                            |

### 8.3 Security Coverage Audit

- **Authentication:** **meaningfully covered** by integration tests (`auth.integration`), including invalid token and credential failures.
- **Route authorization:** **meaningfully covered** for many domains (events/reservations/admin/data-collection) with 403/401 assertions.
- **Object-level authorization:** **partially covered**; reservations/check-in and attachment read/download covered, but attachment upload write-scope is untested and currently defective.
- **Tenant/data isolation:** **partially covered**; user self/admin access and scope checks exist, but list metadata consistency (post-filter totals) and full cross-resource scope parity are not comprehensively tested.
- **Admin/internal protection:** **covered** in integration tests for major admin/internal endpoints.

### 8.4 Final Coverage Judgment

- **Final Coverage Judgment:** **Partial Pass**
- **Boundary:** Core auth, lifecycle, approval, and many authorization checks are covered; however, severe defects can still pass current tests (notably attachment upload object-scope authorization and startup activation of scheduler/cache subsystems).

## 9. Final Notes

- This report is strictly static and evidence-bound.
- Runtime behavior claims in README remain **Manual Verification Required** unless backed by executable evidence.
- Highest-priority remediation is security and ops wiring: attachment upload parent authorization and startup initialization of cache/scheduler.
