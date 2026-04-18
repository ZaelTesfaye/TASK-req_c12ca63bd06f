# Audit Report 3 Fix Check (Static Verification)

## Scope and Boundary
- Source issue list reviewed from `./.tmp/audit-report-3.md`.
- Verification scope: `repo/` only (static code/doc/test inspection).
- Not executed: app runtime, Docker stack, test commands.
- Status labels: `Fixed`, `Partially Fixed`, `Not Fixed`.

## Summary
- Total prior findings checked: **9**
- Fixed: **9**
- Partially Fixed: **0**
- Not Fixed: **0**

## Per-Finding Status

| ID | Prior Issue (from audit-report-3.md) | Current Status | Evidence | Notes |
|---|---|---|---|---|
| F-3-01 | Attachment upload lacked object-level parent authorization | **Fixed** | `repo/backend/src/modules/attachments/routes.js:54`, `repo/backend/src/modules/attachments/routes.js:113`, `repo/backend/src/modules/attachments/routes.js:104`, `repo/backend/tests/integration/attachments.integration.test.js:106` | Upload path now calls parent-access guard before `attachmentsService.upload()`. Integration test covers cross-user upload denial (403). |
| F-3-02 | Cache and scheduler were not initialized in runtime startup | **Fixed** | `repo/backend/src/server.js:25`, `repo/backend/src/server.js:43`, `repo/backend/src/server.js:61`, `repo/backend/src/server.js:63`, `repo/backend/tests/integration/startup-bootstrap.integration.test.js:17` | Startup now initializes cache + scheduler and tears both down on shutdown; bootstrap integration test asserts both init calls occur. |
| F-3-03 | Scheduler cache-warm query used wrong recipe columns | **Fixed** | `repo/backend/src/plugins/scheduler.js:190`, `repo/backend/src/plugins/scheduler.js:191`, `repo/backend/src/plugins/scheduler.js:205`, `repo/backend/src/modules/recipes/repository.js:123` | Scheduler now mirrors approved-recipe join strategy against `recipe_versions` (`cv.status='approved'`). |
| F-3-04 | Sensitive-field encryption/masking was scaffolded but not applied in flows | **Fixed** | `repo/backend/src/modules/users/repository.js:39`, `repo/backend/src/modules/users/repository.js:98`, `repo/backend/src/modules/users/repository.js:171`, `repo/backend/src/modules/users/repository.js:227`, `repo/backend/tests/unit/users-repository.test.js:254` | User repository now encrypts PII at write-time and returns masked values on reads/lists; unit tests verify ciphertext-at-rest and masked API-shape outputs. |
| F-3-05 | Frontend event search param not supported by backend list API | **Fixed** | `repo/frontend/src/routes/events/+page.svelte:33`, `repo/backend/src/modules/events/routes.js:41`, `repo/backend/src/modules/events/repository.js:65`, `repo/backend/src/modules/events/repository.js:89` | Backend query schema and repository filtering now support `search` (title/description ILIKE), matching frontend behavior. |
| F-3-06 | Inventory gap-resolve contract mismatch (`:id` vs body `item_id`) | **Fixed** | `repo/backend/src/modules/inventory/routes.js:233`, `repo/backend/src/modules/inventory/routes.js:243`, `repo/backend/src/modules/inventory/routes.js:248`, `repo/frontend/src/routes/inventory/+page.svelte:58` | Route uses `:item_id` as authoritative identifier; frontend calls the same contract and body carries only gap fields (`missing_date`, `notes`). |
| F-3-07 | Check-in nav permission mapped to wrong capability | **Fixed** | `repo/frontend/src/routes/+layout.svelte:6`, `repo/frontend/src/routes/+layout.svelte:57`, `repo/frontend/src/lib/constants/permissions.js:15` | Check-in navigation now requires `EVENT_SERVICE`, aligned with backend check-in route authorization intent. |
| F-3-08 | Reservation list pagination total could ignore non-admin scope | **Fixed** | `repo/backend/src/modules/reservations/routes.js:121`, `repo/backend/src/modules/reservations/repository.js:86`, `repo/backend/src/modules/reservations/repository.js:133`, `repo/backend/src/modules/reservations/repository.js:144` | Scope is now applied in repository query before count; pagination totals reflect caller-visible rows. |
| F-3-09 | README/API test command guidance inconsistent with backend script alias | **Fixed** | `repo/backend/package.json:12`, `repo/README.md:194`, `repo/README.md:196` | `test:api` points to `tests/integration` and README explicitly states `tests/api` is helper-only. |

## Final Determination
- All findings from `audit-report-3.md` are statically addressed in the current codebase.
- No previously reported item remains open under static inspection.

## Residual Risk
- This check did not execute runtime/tests; final confidence for behavior still depends on running the relevant suites (`tests/integration`, frontend E2E) in your target environment.
