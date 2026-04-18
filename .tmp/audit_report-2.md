# Static Audit Report (`audit_report-4.md`)

## 1. Verdict

- **Overall conclusion:** **Partial Pass**

## 2. Scope and Static Verification Boundary

- **Reviewed:** `repo/README.md`, backend entrypoints/plugins/middleware/modules, frontend route/components/stores, migrations, and backend/frontend test suites.
- **Excluded from evidence:** `./.tmp/**` (used only as output target, not as factual source).
- **Intentionally not executed:** app startup, Docker, database runtime, tests, browser/E2E runtime.
- **Manual verification required for runtime-dependent claims:** actual scheduler firing behavior, backup artifact creation/restoration, real file persistence/variant generation on disk, UI rendering quality across devices, and cache/circuit-breaker behavior under load.

## 3. Repository / Requirement Mapping Summary

- **Prompt core goal mapped:** end-to-end hospitality operations platform spanning events, approvals, reservations/check-in, recipes, inventory, entitlements, attachments, auditability, ops controls.
- **Main mapped implementation areas:**
  - Auth/RBAC: `repo/backend/src/auth/routes.js:188`, `repo/backend/src/middleware/authenticate.js:22`, `repo/backend/src/middleware/authorize.js:13`
  - Event + approval/budget gates: `repo/backend/src/modules/events/service.js:21`, `repo/backend/src/modules/events/service.js:27`, `repo/backend/src/modules/events/service.js:190`
  - Reservations lifecycle + overtime: `repo/backend/src/modules/reservations/routes.js:78`, `repo/backend/src/modules/reservations/service.js:246`, `repo/backend/src/modules/reservations/service.js:498`
  - Recipes workflow: `repo/backend/src/modules/recipes/service.js:126`, `repo/backend/src/modules/recipes/service.js:173`
  - Inventory + report blocking on gaps: `repo/backend/src/modules/inventory/routes.js:201`, `repo/backend/src/modules/reports/routes.js:58`, `repo/backend/tests/integration/reports.integration.test.js:65`
  - Entitlements issuance/redemption: `repo/backend/src/modules/entitlements/service.js:372`
  - Attachments constraints + parent auth: `repo/backend/src/modules/attachments/service.js:50`, `repo/backend/src/modules/attachments/routes.js:54`, `repo/backend/src/modules/attachments/routes.js:113`
  - Ops subsystems (cache/scheduler/backup/data collection): `repo/backend/src/server.js:25`, `repo/backend/src/server.js:43`, `repo/backend/src/plugins/scheduler.js:190`, `repo/backend/src/modules/backup/routes.js:41`, `repo/backend/src/modules/data-collection/service.js:1`

## 4. Section-by-section Review

### 1. Hard Gates

#### 1.1 Documentation and static verifiability

- **Conclusion:** **Pass**
- **Rationale:** README provides setup/config/test instructions and maps to scripts/modules with consistent entry points.
- **Evidence:** `repo/README.md:31`, `repo/README.md:194`, `repo/backend/package.json:7`, `repo/frontend/package.json:6`, `repo/backend/src/server.js:1`, `repo/backend/src/app.js:1`
- **Manual verification:** Docker startup/migration success still requires runtime execution.

#### 1.2 Material deviation from Prompt

- **Conclusion:** **Partial Pass**
- **Rationale:** Core domains are implemented, but one Prompt-critical redemption failure path is defective and one role-based UI flow (overtime approval) is broken in frontend behavior.
- **Evidence:** `repo/backend/src/modules/entitlements/service.js:413`, `repo/backend/src/modules/entitlements/service.js:415`, `repo/frontend/src/routes/reservations/+page.svelte:53`, `repo/frontend/src/routes/reservations/+page.svelte:132`, `repo/backend/src/modules/reservations/routes.js:67`

### 2. Delivery Completeness

#### 2.1 Core requirement coverage

- **Conclusion:** **Partial Pass**
- **Rationale:** Most explicit flows are present (event lifecycle, reservations, recipes, inventory/reporting constraints, entitlements, attachments, data-collection subsystem, backups), but two defects materially impact prompt-fit completeness.
- **Evidence:** `repo/backend/src/modules/events/service.js:27`, `repo/backend/src/modules/reservations/routes.js:360`, `repo/backend/src/modules/recipes/service.js:126`, `repo/backend/src/modules/reports/routes.js:58`, `repo/backend/src/modules/data-collection/service.js:1`, `repo/backend/src/modules/backup/routes.js:58`, plus findings in `repo/backend/src/modules/entitlements/service.js:415` and `repo/frontend/src/routes/reservations/+page.svelte:53`

#### 2.2 Basic end-to-end 0-to1 deliverable

- **Conclusion:** **Pass**
- **Rationale:** Fullstack structure is coherent with backend/frontend modules, DB migrations/seeds, and broad test assets.
- **Evidence:** `repo/README.md:289`, `repo/backend/src/app.js:132`, `repo/frontend/src/routes/+layout.svelte:1`, `repo/backend/tests/integration/events.integration.test.js:1`, `repo/frontend/tests/e2e/events.test.js:1`

### 3. Engineering and Architecture Quality

#### 3.1 Structure and module decomposition

- **Conclusion:** **Pass**
- **Rationale:** Backend is route/service/repository oriented; frontend has route-centric pages with shared API/store/component layers.
- **Evidence:** `repo/backend/src/modules/events/routes.js:1`, `repo/backend/src/modules/events/service.js:1`, `repo/backend/src/modules/events/repository.js:1`, `repo/frontend/src/lib/api/client.js:1`, `repo/frontend/src/lib/stores/auth.js:1`

#### 3.2 Maintainability and extensibility

- **Conclusion:** **Partial Pass**
- **Rationale:** Overall maintainable, but one utility/test navigation model diverges from runtime layout permissions, reducing reliability of guard tests.
- **Evidence:** `repo/frontend/src/routes/+layout.svelte:57`, `repo/frontend/src/lib/utils/navigation.js:17`, `repo/frontend/tests/unit/route-guards.test.js:193`

### 4. Engineering Details and Professionalism

#### 4.1 Error handling, logging, validation, API design

- **Conclusion:** **Partial Pass**
- **Rationale:** Structured errors/validation/logging are strong, but redemption not-found handling writes an invalid FK event id, likely causing 500 instead of intended graceful failure.
- **Evidence:** `repo/backend/src/app.js:76`, `repo/backend/src/middleware/validate.js:1`, `repo/backend/src/logging/index.js:19`, `repo/backend/src/modules/entitlements/service.js:413`, `repo/backend/src/modules/entitlements/service.js:415`, `repo/backend/src/db/migrations/001_initial_schema.js:481`

#### 4.2 Product-like delivery shape

- **Conclusion:** **Pass**
- **Rationale:** Delivery resembles a real product with RBAC, audit trails, ops/admin modules, and end-user workflows.
- **Evidence:** `repo/README.md:86`, `repo/backend/src/modules/audit/routes.js:1`, `repo/backend/src/modules/admin-cache-routes.js:1`, `repo/frontend/src/routes/check-in/+page.svelte:1`

### 5. Prompt Understanding and Requirement Fit

#### 5.1 Business understanding and constraint fit

- **Conclusion:** **Partial Pass**
- **Rationale:** Business semantics are broadly implemented, including budget caps, approvals, recipe governance, inventory gaps, entitlement issuance, and ops controls; however, overtime-approval UI submission and redemption-not-found behavior create requirement-fit gaps.
- **Evidence:** `repo/backend/src/modules/events/service.js:21`, `repo/backend/src/modules/events/service.js:190`, `repo/backend/src/modules/recipes/service.js:173`, `repo/backend/src/modules/reports/routes.js:58`, `repo/backend/src/modules/entitlements/service.js:413`, `repo/frontend/src/routes/reservations/+page.svelte:53`

### 6. Aesthetics (frontend/full-stack)

#### 6.1 Visual/interaction fit

- **Conclusion:** **Cannot Confirm Statistically**
- **Rationale:** Static code indicates intentional layouts and interaction states, but rendering quality and device ergonomics require runtime/browser verification.
- **Evidence:** `repo/frontend/src/routes/+layout.svelte:1`, `repo/frontend/src/routes/check-in/+page.svelte:72`, `repo/frontend/src/routes/events/+page.svelte:1`
- **Manual verification:** tablet check-in ergonomics, responsive spacing/typography, and interaction polish.

## 5. Issues / Suggestions (Severity-Rated)

### Blocker / High

1. **Severity:** High  
   **Title:** Entitlement redemption "not found" path attempts to write an invalid foreign-key event id  
   **Conclusion:** Fail  
   **Evidence:** `repo/backend/src/modules/entitlements/service.js:413`, `repo/backend/src/modules/entitlements/service.js:415`, `repo/backend/src/db/migrations/001_initial_schema.js:478`, `repo/backend/src/db/migrations/001_initial_schema.js:481`  
   **Impact:** The intended graceful failure path for nonexistent entitlements can violate `redemption_records.event_id -> events.id` FK and produce internal errors instead of deterministic API failure semantics.  
   **Minimum actionable fix:** For nonexistent entitlement, skip `redemption_records` insert (or make `event_id` nullable/optional for failure records and migrate safely), then return a structured domain error response with audit-safe logging.

2. **Severity:** High  
   **Title:** Frontend overtime-approval action cannot satisfy backend-required request body  
   **Conclusion:** Fail  
   **Evidence:** `repo/backend/src/modules/reservations/routes.js:67`, `repo/backend/src/modules/reservations/routes.js:437`, `repo/frontend/src/routes/reservations/+page.svelte:53`, `repo/frontend/src/routes/reservations/+page.svelte:132`  
   **Impact:** Prompt-critical overtime approval workflow is not executable from the Svelte role-based screen because no `justification` field is collected/sent for `/approve-overtime`.  
   **Minimum actionable fix:** Add modal inputs/validation for overtime approval justification and submit `{ justification }` when `modalAction === 'approve-overtime'`; add a frontend integration/e2e test.

### Medium / Low

3. **Severity:** Medium  
   **Title:** Navigation utility and unit tests are out of sync with actual layout permission mapping  
   **Conclusion:** Partial Fail  
   **Evidence:** `repo/frontend/src/routes/+layout.svelte:57`, `repo/frontend/src/lib/utils/navigation.js:17`, `repo/frontend/tests/unit/route-guards.test.js:193`  
   **Impact:** Frontend guard tests can pass while asserting stale permission behavior (`entitlement:redeem` for check-in) that no longer matches runtime UI (`event:service`).  
   **Minimum actionable fix:** Make layout and testable navigation use one shared permission source; update unit tests to match current runtime mapping.

4. **Severity:** Medium  
   **Title:** Missing automated test for nonexistent-entitlement redemption path  
   **Conclusion:** Insufficient Coverage  
   **Evidence:** `repo/backend/tests/integration/entitlements.integration.test.js:95`, `repo/backend/tests/integration/entitlements.integration.test.js:213`  
   **Impact:** Current suite exercises success/insufficient/expired cases but not nonexistent entitlement IDs, so the high-risk FK failure path can regress undetected.  
   **Minimum actionable fix:** Add integration test for `POST /entitlements/:id/redeem` with unknown UUID and assert stable non-500 behavior.

5. **Severity:** Low  
   **Title:** Frontend reservation action inputs lack client-side guardrails for invalid datetime submissions  
   **Conclusion:** Partial Fail  
   **Evidence:** `repo/frontend/src/routes/reservations/+page.svelte:55`, `repo/frontend/src/routes/reservations/+page.svelte:56`, `repo/frontend/src/routes/reservations/+page.svelte:57`  
   **Impact:** `new Date(...).toISOString()` on empty/invalid values can produce client runtime errors before request dispatch.  
   **Minimum actionable fix:** Validate required datetime fields before `toISOString()` conversion and disable submit until valid inputs are present.

## 6. Security Review Summary

- **Authentication entry points:** **Pass**  
  Evidence: `repo/backend/src/auth/routes.js:188`, `repo/backend/src/auth/routes.js:281`, `repo/backend/src/middleware/authenticate.js:22`.

- **Route-level authorization:** **Pass**  
  Evidence: `repo/backend/src/middleware/authorize.js:13`, `repo/backend/src/modules/checkin/routes.js:51`, `repo/backend/src/modules/backup/routes.js:47`, `repo/backend/src/modules/admin-cache-routes.js:29`.

- **Object-level authorization:** **Partial Pass**  
  Evidence: `repo/backend/src/modules/attachments/routes.js:54`, `repo/backend/src/modules/attachments/routes.js:113`, `repo/backend/src/modules/entitlements/routes.js:124`, `repo/backend/src/modules/reservations/service.js:23`.  
  Note: Ownership/scope checks are broadly present; primary open security-related defect is redemption not-found failure handling.

- **Function-level authorization:** **Pass**  
  Evidence: `repo/backend/src/modules/events/routes.js:247`, `repo/backend/src/modules/events/routes.js:267`, `repo/backend/src/modules/reservations/routes.js:437`.

- **Tenant/user data isolation:** **Partial Pass**  
  Evidence: `repo/backend/src/modules/entitlements/routes.js:79`, `repo/backend/src/modules/reservations/routes.js:121`, `repo/backend/src/modules/reservations/repository.js:133`.  
  Note: user-level/resource scope enforcement exists where expected; no multi-tenant architecture claim was audited beyond these controls.

- **Admin/internal/debug protection:** **Pass**  
  Evidence: `repo/backend/src/modules/data-collection/routes.js:46`, `repo/backend/src/modules/backup/routes.js:41`, `repo/backend/src/modules/admin-cache-routes.js:29`.

## 7. Tests and Logging Review

- **Unit tests:** **Pass**  
  Evidence: `repo/backend/tests/unit/encryption.test.js:1`, `repo/backend/tests/unit/scheduler.test.js:1`, `repo/frontend/tests/unit/route-guards.test.js:1`.

- **API/integration tests:** **Partial Pass**  
  Evidence: `repo/backend/tests/integration/events.integration.test.js:1`, `repo/backend/tests/integration/reservations-lifecycle.integration.test.js:1`, `repo/backend/tests/integration/attachments.integration.test.js:106`, `repo/backend/tests/integration/entitlements.integration.test.js:95`.  
  Gap: missing unknown-entitlement redemption regression test.

- **Logging categories/observability:** **Pass**  
  Evidence: `repo/backend/src/logging/index.js:38`, `repo/backend/src/app.js:52`, `repo/backend/src/app.js:61`.

- **Sensitive-data leakage risk in logs/responses:** **Partial Pass**  
  Evidence: `repo/backend/src/logging/index.js:19`, `repo/backend/src/logging/index.js:41`, `repo/backend/src/modules/users/repository.js:64`, `repo/backend/src/modules/users/repository.js:227`.  
  Note: redaction + masking are implemented; runtime logging behavior for all plugin error payloads remains manual-verification territory.

## 8. Test Coverage Assessment (Static Audit)

### 8.1 Test Overview

- **Unit tests present:** yes (backend and frontend).  
  Evidence: `repo/backend/package.json:10`, `repo/frontend/package.json:10`, `repo/backend/tests/unit/encryption.test.js:1`, `repo/frontend/tests/unit/api-client.test.js:1`.
- **API/integration tests present:** yes (backend).  
  Evidence: `repo/backend/package.json:12`, `repo/backend/tests/integration/events.integration.test.js:1`.
- **E2E tests present:** yes (frontend Playwright).  
  Evidence: `repo/frontend/package.json:11`, `repo/frontend/tests/e2e/checkin.test.js:1`.
- **Documentation includes test commands:** yes.  
  Evidence: `repo/README.md:182`, `repo/README.md:196`.

### 8.2 Coverage Mapping Table

| Requirement / Risk Point                                         | Mapped Test Case(s)                                                                                                                                                                                                 | Key Assertion / Fixture / Mock                                      | Coverage Assessment | Gap                                   | Minimum Test Addition                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------- | ------------------------------------- | ------------------------------------------------------- |
| Auth login/refresh/me/logout + failures                          | `repo/backend/tests/integration/auth.integration.test.js:1`, `repo/backend/tests/integration/token-contract.integration.test.js:1`                                                                                  | 401/422 token and credential paths                                  | sufficient          | none major                            | keep token-rotation regressions                         |
| Event state machine + budget caps/threshold approvals            | `repo/backend/tests/integration/events.integration.test.js:176`, `repo/backend/tests/integration/authorization-and-budget-gates.integration.test.js:278`                                                            | draft→submitted→approved transitions, >10% gate assertions          | sufficient          | none major                            | add malformed-state transition negatives if needed      |
| Reservation lifecycle incl overtime approval                     | `repo/backend/tests/integration/reservations-lifecycle.integration.test.js:1`                                                                                                                                       | lifecycle route status transitions incl overtime approval endpoint  | sufficient          | frontend path not covered             | add UI/e2e overtime approval flow test                  |
| Object-level auth for attachments                                | `repo/backend/tests/integration/attachments.integration.test.js:106`, `repo/backend/tests/integration/authorization-and-budget-gates.integration.test.js:140`                                                       | cross-user upload/read 403 assertions                               | sufficient          | none major                            | maintain regression tests for recipe-parent attachments |
| Entitlement redemption idempotency + expiry + insufficient quota | `repo/backend/tests/integration/entitlements.integration.test.js:115`, `repo/backend/tests/integration/entitlements.integration.test.js:182`, `repo/backend/tests/integration/entitlements.integration.test.js:213` | same idempotency key no double decrement; failure reasons validated | basically covered   | unknown-entitlement path missing      | add test for unknown entitlement UUID redemption        |
| Startup wiring for cache/scheduler                               | `repo/backend/tests/integration/startup-bootstrap.integration.test.js:17`                                                                                                                                           | asserts `initCache` and `initScheduler` calls                       | sufficient          | runtime cron effects not executed     | add runtime smoke in controlled env (manual/CI stage)   |
| Reports export + unresolved gap block                            | `repo/backend/tests/integration/reports.integration.test.js:44`, `repo/backend/tests/integration/reports.integration.test.js:65`                                                                                    | CSV headers and 409 unresolved gaps                                 | sufficient          | none major                            | add date edge-case coverage                             |
| Backup/drill admin protection                                    | `repo/backend/tests/integration/backup.integration.test.js:35`                                                                                                                                                      | admin 200 + non-admin 403 paths                                     | sufficient          | backup artifact creation not executed | manual DR drill verification in env                     |
| Frontend check-in/events navigation flows                        | `repo/frontend/tests/e2e/checkin.test.js:1`, `repo/frontend/tests/e2e/events.test.js:1`                                                                                                                             | route interaction happy paths                                       | partially covered   | overtime-approval flow missing        | add e2e for reservation overtime approval modal/body    |

### 8.3 Security Coverage Audit

- **authentication:** meaningfully covered (integration tests assert valid/invalid token paths).
- **route authorization:** meaningfully covered across events/reservations/admin/cache/backup/data-collection.
- **object-level authorization:** partially covered; reservations and attachments have strong cases, but not-found entitlement redemption failure path is untested.
- **tenant/data isolation:** partially covered through entitlement ownership and manager scope tests; no full matrix across every list endpoint.
- **admin/internal protection:** covered for backup/cache/data-collection routes.

### 8.4 Final Coverage Judgment

- **Final Coverage Judgment:** **Partial Pass**
- **Boundary:** Core flows and many security controls are tested, but critical edge-path gaps remain (notably unknown-entitlement redemption and missing frontend overtime-approval test coverage), so severe defects can still survive current suites.

## 9. Final Notes

- This report is static and evidence-bound only.
- Runtime claims in docs remain manual-verification items unless validated by executed evidence.
- Highest-priority remediation targets:
  1. Entitlement redemption not-found failure-path correctness.
  2. Frontend overtime-approval submission path parity with backend contract.
