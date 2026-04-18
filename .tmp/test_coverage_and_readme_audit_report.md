# Test Coverage Audit

## Scope and Method

- Mode: static inspection only. No execution of code/tests/scripts/containers.
- Endpoint source of truth:
  - repo/backend/src/app.js
  - repo/backend/src/auth/routes.js
  - repo/backend/src/modules/\*\*/routes.js
  - repo/backend/src/modules/admin-cache-routes.js
- API test source of truth:
  - repo/backend/tests/integration/\*.integration.test.js
  - repo/backend/tests/integration/setup.js
- Unit test source of truth:
  - repo/backend/tests/unit/\*.test.js
  - repo/frontend/tests/unit/\*.test.js
- README source of truth:
  - repo/README.md

## Project Type Detection

- Declared type: fullstack
- Evidence: repo/README.md line 1 (Project Type: fullstack)

## Backend Endpoint Inventory

Total endpoints discovered: 87

1. GET /health
2. POST /auth/register
3. POST /auth/login
4. POST /auth/refresh
5. POST /auth/logout
6. GET /auth/me
7. GET /users
8. GET /users/:id
9. PATCH /users/:id/status
10. GET /admin/roles
11. POST /admin/users/:id/roles
12. DELETE /admin/users/:id/roles/:roleId
13. POST /admin/users/:id/manager-scopes
14. DELETE /admin/users/:id/manager-scopes/:eventId
15. GET /admin/users/:id/manager-scopes
16. POST /events
17. GET /events
18. GET /events/:id
19. PATCH /events/:id
20. PATCH /events/:id/state
21. GET /events/:id/audit-trail
22. POST /events/:id/materials
23. DELETE /events/:id/materials/:materialId
24. POST /events/:id/service-windows
25. DELETE /events/:id/service-windows/:windowId
26. POST /events/:id/resource-requests
27. GET /approvals/pending
28. POST /approvals/:id/approve
29. POST /approvals/:id/reject
30. GET /catalog/tree
31. POST /catalog/resources
32. PATCH /catalog/resources/:id
33. POST /catalog/resources/:id/publish
34. GET /catalog/resources/:id
35. POST /catalog/templates
36. PATCH /catalog/templates/:id
37. POST /catalog/templates/:id/publish
38. GET /catalog/templates
39. POST /reservations
40. GET /reservations
41. GET /reservations/:id
42. POST /reservations/:id/approve
43. POST /reservations/:id/release
44. POST /reservations/:id/occupy
45. POST /reservations/:id/return
46. POST /reservations/:id/cancel
47. POST /reservations/:id/reschedule
48. POST /reservations/:id/renew
49. POST /reservations/:id/approve-overtime
50. POST /recipes
51. GET /recipes
52. GET /recipes/:id
53. POST /recipes/:id/revisions
54. POST /recipes/:id/submit-review
55. POST /recipes/:id/approve
56. POST /recipes/:id/reject
57. GET /entitlements
58. GET /entitlements/:id
59. GET /entitlements/:id/redemptions
60. POST /entitlements/issue-manual
61. POST /entitlements/bulk-import/validate
62. POST /entitlements/bulk-import/confirm
63. POST /entitlements/:id/redeem
64. GET /inventory/items
65. GET /inventory/items/:id
66. GET /inventory/snapshots
67. GET /inventory/anomalies
68. GET /inventory/gaps
69. POST /inventory/gaps/:item_id/resolve
70. POST /attachments
71. GET /attachments
72. GET /attachments/:id
73. GET /attachments/:id/download
74. POST /events/:id/check-in
75. GET /events/:id/check-in
76. GET /reports/inventory/export
77. GET /reports/events/export
78. GET /reports/approvals/export
79. GET /data-collection/health
80. POST /data-collection/jobs/:id/requeue
81. GET /admin/data-collection/jobs
82. GET /admin/backups/runs
83. POST /admin/backups/restore-test
84. GET /admin/backups/drills
85. GET /admin/audit-trail
86. POST /admin/cache/purge
87. GET /admin/cache/stats

## API Test Mapping Table

Legend:

- TNH = true no-mock HTTP
- HWM = HTTP with mocking
- IND = unit-only/indirect/non-HTTP

| Endpoint                                        | Covered | Type | Test files                                                                                 | Evidence                                                         |
| ----------------------------------------------- | ------- | ---- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| GET /health                                     | yes     | TNH  | health.integration.test.js, startup-bootstrap.integration.test.js                          | app.inject GET /health                                           |
| POST /auth/register                             | yes     | TNH  | auth.integration.test.js                                                                   | describe POST /auth/register + url /auth/register                |
| POST /auth/login                                | yes     | TNH  | auth.integration.test.js, token-contract.integration.test.js                               | url /auth/login                                                  |
| POST /auth/refresh                              | yes     | TNH  | auth.integration.test.js, token-contract.integration.test.js                               | url /auth/refresh                                                |
| POST /auth/logout                               | yes     | TNH  | auth.integration.test.js                                                                   | url /auth/logout                                                 |
| GET /auth/me                                    | yes     | TNH  | auth.integration.test.js, token-contract.integration.test.js                               | url /auth/me                                                     |
| GET /users                                      | yes     | TNH  | users.integration.test.js                                                                  | url /users                                                       |
| GET /users/:id                                  | yes     | TNH  | users.integration.test.js                                                                  | GET /users/<uuid>                                                |
| PATCH /users/:id/status                         | yes     | TNH  | users.integration.test.js                                                                  | PATCH /users/<uuid>/status                                       |
| GET /admin/roles                                | yes     | TNH  | admin.integration.test.js                                                                  | url /admin/roles                                                 |
| POST /admin/users/:id/roles                     | yes     | TNH  | admin.integration.test.js                                                                  | POST /admin/users/<uuid>/roles                                   |
| DELETE /admin/users/:id/roles/:roleId           | yes     | TNH  | admin.integration.test.js                                                                  | DELETE role assignment path                                      |
| POST /admin/users/:id/manager-scopes            | yes     | TNH  | admin.integration.test.js                                                                  | POST manager-scopes path                                         |
| DELETE /admin/users/:id/manager-scopes/:eventId | yes     | TNH  | admin.integration.test.js                                                                  | DELETE manager-scopes path                                       |
| GET /admin/users/:id/manager-scopes             | yes     | TNH  | admin.integration.test.js                                                                  | GET manager-scopes path                                          |
| POST /events                                    | yes     | TNH  | events.integration.test.js and multiple suites                                             | POST /events appears across suites                               |
| GET /events                                     | yes     | TNH  | events.integration.test.js, error-envelope.integration.test.js                             | GET /events                                                      |
| GET /events/:id                                 | yes     | TNH  | events.integration.test.js, response-shape-contract.integration.test.js                    | GET /events/<uuid>                                               |
| PATCH /events/:id                               | yes     | TNH  | events.integration.test.js, authorization suites                                           | PATCH /events/<uuid>                                             |
| PATCH /events/:id/state                         | yes     | TNH  | events.integration.test.js, events-mutations.integration.test.js                           | PATCH /events/<uuid>/state                                       |
| GET /events/:id/audit-trail                     | yes     | TNH  | events-mutations.integration.test.js                                                       | GET /events/<uuid>/audit-trail                                   |
| POST /events/:id/materials                      | yes     | TNH  | events-mutations.integration.test.js, authorization-and-budget-gates.integration.test.js   | POST materials path                                              |
| DELETE /events/:id/materials/:materialId        | yes     | TNH  | events-mutations.integration.test.js, authorization-and-budget-gates.integration.test.js   | DELETE materials path                                            |
| POST /events/:id/service-windows                | yes     | TNH  | events.integration.test.js, events-mutations.integration.test.js                           | POST service-windows path                                        |
| DELETE /events/:id/service-windows/:windowId    | yes     | TNH  | events-mutations.integration.test.js, authorization-and-budget-gates.integration.test.js   | DELETE service-windows path                                      |
| POST /events/:id/resource-requests              | yes     | TNH  | events-mutations.integration.test.js                                                       | POST resource-requests path                                      |
| GET /approvals/pending                          | yes     | TNH  | approvals-routes.integration.test.js                                                       | GET /approvals/pending                                           |
| POST /approvals/:id/approve                     | yes     | TNH  | approvals-routes.integration.test.js                                                       | POST /approvals/<uuid>/approve                                   |
| POST /approvals/:id/reject                      | yes     | TNH  | approvals-routes.integration.test.js                                                       | POST /approvals/<uuid>/reject                                    |
| GET /catalog/tree                               | yes     | TNH  | catalog.integration.test.js                                                                | GET /catalog/tree                                                |
| POST /catalog/resources                         | yes     | TNH  | catalog.integration.test.js, error-envelope.integration.test.js                            | POST /catalog/resources                                          |
| PATCH /catalog/resources/:id                    | yes     | TNH  | catalog.integration.test.js                                                                | PATCH resource path                                              |
| POST /catalog/resources/:id/publish             | yes     | TNH  | catalog.integration.test.js                                                                | POST publish resource path                                       |
| GET /catalog/resources/:id                      | yes     | TNH  | catalog.integration.test.js                                                                | GET resource by id path                                          |
| POST /catalog/templates                         | yes     | TNH  | catalog.integration.test.js                                                                | POST /catalog/templates                                          |
| PATCH /catalog/templates/:id                    | yes     | TNH  | catalog.integration.test.js                                                                | PATCH template path                                              |
| POST /catalog/templates/:id/publish             | yes     | TNH  | catalog.integration.test.js                                                                | POST publish template path                                       |
| GET /catalog/templates                          | yes     | TNH  | catalog.integration.test.js                                                                | GET templates path                                               |
| POST /reservations                              | yes     | TNH  | reservations-lifecycle.integration.test.js, reservations-authorization.integration.test.js | POST /reservations                                               |
| GET /reservations                               | yes     | TNH  | reservations-lifecycle.integration.test.js, reservations-authorization.integration.test.js | GET /reservations with query                                     |
| GET /reservations/:id                           | yes     | TNH  | reservations-lifecycle.integration.test.js, reservations-authorization.integration.test.js | GET /reservations/<uuid>                                         |
| POST /reservations/:id/approve                  | yes     | TNH  | reservations-lifecycle.integration.test.js                                                 | approve path                                                     |
| POST /reservations/:id/release                  | yes     | TNH  | reservations-lifecycle.integration.test.js                                                 | release path                                                     |
| POST /reservations/:id/occupy                   | yes     | TNH  | reservations-lifecycle.integration.test.js                                                 | occupy path                                                      |
| POST /reservations/:id/return                   | yes     | TNH  | reservations-lifecycle.integration.test.js                                                 | return path                                                      |
| POST /reservations/:id/cancel                   | yes     | TNH  | reservations-lifecycle.integration.test.js                                                 | cancel path                                                      |
| POST /reservations/:id/reschedule               | yes     | TNH  | reservations-lifecycle.integration.test.js                                                 | reschedule path                                                  |
| POST /reservations/:id/renew                    | yes     | TNH  | reservations-lifecycle.integration.test.js                                                 | renew path                                                       |
| POST /reservations/:id/approve-overtime         | yes     | TNH  | reservations-lifecycle.integration.test.js                                                 | tests for approve, 422, 403, 401 validation on /approve-overtime |
| POST /recipes                                   | yes     | TNH  | recipes.integration.test.js                                                                | POST /recipes                                                    |
| GET /recipes                                    | yes     | TNH  | recipes.integration.test.js                                                                | GET /recipes                                                     |
| GET /recipes/:id                                | yes     | TNH  | recipes.integration.test.js                                                                | GET /recipes/<uuid>                                              |
| POST /recipes/:id/revisions                     | yes     | TNH  | recipes.integration.test.js                                                                | revisions path                                                   |
| POST /recipes/:id/submit-review                 | yes     | TNH  | recipes.integration.test.js                                                                | submit-review path                                               |
| POST /recipes/:id/approve                       | yes     | TNH  | recipes.integration.test.js                                                                | approve path                                                     |
| POST /recipes/:id/reject                        | yes     | TNH  | recipes.integration.test.js                                                                | reject path                                                      |
| GET /entitlements                               | yes     | TNH  | entitlements-routes.integration.test.js                                                    | GET /entitlements                                                |
| GET /entitlements/:id                           | yes     | TNH  | entitlements-routes.integration.test.js                                                    | GET entitlement by id                                            |
| GET /entitlements/:id/redemptions               | yes     | TNH  | entitlements-routes.integration.test.js                                                    | redemptions path                                                 |
| POST /entitlements/issue-manual                 | yes     | TNH  | entitlements.integration.test.js, entitlements-routes.integration.test.js                  | issue-manual path                                                |
| POST /entitlements/bulk-import/validate         | yes     | TNH  | entitlements-routes.integration.test.js                                                    | validate path                                                    |
| POST /entitlements/bulk-import/confirm          | yes     | TNH  | entitlements-routes.integration.test.js                                                    | confirm path                                                     |
| POST /entitlements/:id/redeem                   | yes     | TNH  | entitlements.integration.test.js, entitlements-routes.integration.test.js                  | redeem path                                                      |
| GET /inventory/items                            | yes     | TNH  | inventory.integration.test.js                                                              | GET /inventory/items                                             |
| GET /inventory/items/:id                        | yes     | TNH  | inventory.integration.test.js                                                              | item by id path                                                  |
| GET /inventory/snapshots                        | yes     | TNH  | inventory.integration.test.js                                                              | snapshots path                                                   |
| GET /inventory/anomalies                        | yes     | TNH  | inventory.integration.test.js                                                              | anomalies path                                                   |
| GET /inventory/gaps                             | yes     | TNH  | inventory.integration.test.js                                                              | gaps path                                                        |
| POST /inventory/gaps/:item_id/resolve           | yes     | TNH  | inventory.integration.test.js                                                              | resolve path                                                     |
| POST /attachments                               | yes     | TNH  | attachments.integration.test.js                                                            | upload path                                                      |
| GET /attachments                                | yes     | TNH  | attachments.integration.test.js                                                            | list path                                                        |
| GET /attachments/:id                            | yes     | TNH  | attachments.integration.test.js                                                            | metadata path                                                    |
| GET /attachments/:id/download                   | yes     | TNH  | attachments.integration.test.js                                                            | download path                                                    |
| POST /events/:id/check-in                       | yes     | TNH  | checkin.integration.test.js                                                                | POST check-in path                                               |
| GET /events/:id/check-in                        | yes     | TNH  | checkin.integration.test.js                                                                | GET check-in path                                                |
| GET /reports/inventory/export                   | yes     | TNH  | reports.integration.test.js                                                                | inventory export                                                 |
| GET /reports/events/export                      | yes     | TNH  | reports.integration.test.js                                                                | events export                                                    |
| GET /reports/approvals/export                   | yes     | TNH  | reports.integration.test.js                                                                | approvals export                                                 |
| GET /data-collection/health                     | yes     | TNH  | data-collection.integration.test.js                                                        | health path                                                      |
| POST /data-collection/jobs/:id/requeue          | yes     | TNH  | data-collection.integration.test.js                                                        | requeue path                                                     |
| GET /admin/data-collection/jobs                 | yes     | TNH  | data-collection.integration.test.js                                                        | admin jobs path                                                  |
| GET /admin/backups/runs                         | yes     | TNH  | backup.integration.test.js                                                                 | runs path                                                        |
| POST /admin/backups/restore-test                | yes     | TNH  | backup.integration.test.js                                                                 | restore-test path                                                |
| GET /admin/backups/drills                       | yes     | TNH  | backup.integration.test.js                                                                 | drills path                                                      |
| GET /admin/audit-trail                          | yes     | TNH  | admin.integration.test.js                                                                  | audit trail path                                                 |
| POST /admin/cache/purge                         | yes     | TNH  | cache-admin.integration.test.js                                                            | purge path                                                       |
| GET /admin/cache/stats                          | yes     | TNH  | cache-admin.integration.test.js                                                            | stats path                                                       |

## API Test Classification

1. True No-Mock HTTP

- All backend integration tests under repo/backend/tests/integration/\*.integration.test.js.
- Evidence of real app + real DB harness in repo/backend/tests/integration/setup.js:
  - getApp builds real app via buildApp
  - setupTestDb runs migrations + seeds
  - no test-time transport/service mocking in integration suite

2. HTTP with Mocking

- None detected in integration suite.
- Evidence: no vi.mock, jest.mock, sinon.stub matches in repo/backend/tests/integration/\*.integration.test.js.

3. Non-HTTP (unit/indirect)

- Backend unit tests in repo/backend/tests/unit/\*.test.js (mock-heavy).
- Frontend unit tests in repo/frontend/tests/unit/\*.test.js (component/page-level tests with mock dependencies).

## Mock Detection

### Backend integration tests

- No mocking primitives detected in integration suite.
- Evidence: search in repo/backend/tests/integration/\*.integration.test.js for vi.mock, jest.mock, sinon.stub returned no matches.

### Backend unit tests

- Mocking present.
- Evidence examples:
  - repo/backend/tests/unit/attachment-validation.test.js: vi.mock on config, db, logging, audit, repository, fs
  - repo/backend/tests/unit/budget-rules.test.js: vi.mock on db, events repository, approvals repository/service, audit
  - repo/backend/tests/unit/scheduler.test.js: vi.mock on node-cron, cache plugin, config

### Frontend unit tests

- Mocking present (expected for isolated page/component tests).
- Evidence examples:
  - repo/frontend/tests/unit/events-page.test.js: vi.doMock on API client, auth store, app navigation/stores; imports real page module
  - repo/frontend/tests/unit/admin-page.test.js: vi.doMock on API/auth; imports real admin page module
  - repo/frontend/tests/unit/login-page.test.js: vi.doMock on API/auth/navigation; imports real login page module

## Coverage Summary

- Total endpoints: 87
- Endpoints with HTTP tests: 87
- Endpoints with true no-mock HTTP tests: 87

Computed:

- HTTP coverage = 87 / 87 = 100.00%
- True API coverage = 87 / 87 = 100.00%

## Unit Test Summary

### Backend Unit Tests

- Files detected: 25 under repo/backend/tests/unit.
- Covered areas:
  - repositories: users, resources, reservations, events
  - middleware/auth/validation: authenticate, authorize, validate
  - shared/cross-cutting: encryption, pagination, errors, cache, scheduler, circuit-breaker, image processor, audit, config
  - business logic examples: overtime, state machine, budget rules, backup, reports, entitlement redemption, data collection

Important backend modules not directly unit-targeted:

- route-layer files are primarily integration-tested, not route-unit-tested
  - repo/backend/src/modules/users/routes.js
  - repo/backend/src/modules/roles/routes.js
  - repo/backend/src/modules/approvals/routes.js
  - repo/backend/src/modules/checkin/routes.js
  - repo/backend/src/modules/events/routes.js

### Frontend Unit Tests (STRICT REQUIREMENT)

Frontend unit tests: PRESENT

Detection against strict rules:

- identifiable frontend test files exist: yes (27 files under repo/frontend/tests/unit)
- tests target frontend logic/components: yes (page/component/store/util suites)
- framework evident: yes (vitest, @testing-library/svelte, jsdom in repo/frontend/package.json)
- tests import/render actual frontend modules/components: yes
  - examples:
    - repo/frontend/tests/unit/events-page.test.js imports ../../src/routes/events/+page.svelte and calls render(EventsPage)
    - repo/frontend/tests/unit/admin-page.test.js imports ../../src/routes/admin/+page.svelte and calls render(AdminPage)
    - repo/frontend/tests/unit/login-page.test.js imports ../../src/routes/login/+page.svelte and calls render(LoginPage)

Frontend components/modules covered (evidence by test file names/imports):

- page routes: login, register, dashboard, events, approvals, reservations, recipes, inventory, entitlements, check-in, catalog, reports, admin
- components/utils/stores: component-rendering, components, auth-store, api-client, validation, pagination, reports-download

Important frontend modules not directly unit-tested:

- nested page routes do not show dedicated direct page tests by filename/import evidence:
  - repo/frontend/src/routes/events/new/+page.svelte
  - repo/frontend/src/routes/events/[id]/+page.svelte
  - repo/frontend/src/routes/recipes/new/+page.svelte
  - repo/frontend/src/routes/recipes/[id]/+page.svelte

Strict failure rule evaluation (fullstack/web + frontend missing/insufficient):

- Not triggered for missing frontend unit tests.
- Residual gap is targeted to selected nested route pages, not total absence.

### Cross-Layer Observation

- Backend API HTTP testing is exceptionally broad and no-mock in integration suites.
- Frontend unit testing is present and broad at top-level route/page coverage, plus components/stores.
- Balance is materially improved versus backend-only posture; remaining imbalance is mainly deep nested-route page coverage.

## API Observability Check

Assessment: strong

Evidence:

- Integration tests use explicit method + URL and pass payload/query where required via app.inject calls.
- Assertions commonly validate status and response body structure/content (auth, reservations lifecycle, catalog, inventory, entitlements, reports suites).

Weak spots:

- A few startup/smoke tests are intentionally shallow and focus on availability/shape.

## Tests Check

- run_tests.sh orchestrates Docker-based backend/frontend/e2e execution.
- README test instructions are Docker compose based.
- No hard dependency on local runtime package-manager installs for normal project startup/test workflow.

## End-to-End Expectations (Fullstack)

- Present.
- Evidence: repo/frontend/tests/e2e/fullstack.spec.js exists; README documents Playwright E2E flow against running backend/frontend containers.

## Test Quality and Sufficiency

- Success paths: broad across all modules.
- Failure paths: substantial (authz/authn validation errors, forbidden/unauthorized checks, state guardrails).
- Edge cases: present in overtime, quota/budget, idempotency/redemption, cache/admin gates, and other targeted suites.
- Main residual quality gaps:
  1. some startup/smoke checks remain shallow by design
  2. nested frontend pages have less direct unit depth than top-level routes

## Test Coverage Score (0-100)

Score: 93/100

## Score Rationale

- - complete endpoint HTTP coverage (87/87)
- - integration suite appears true no-mock and uses real app + DB harness
- - broad frontend unit presence with real page imports/renders
- - frontend nested route-page unit depth is not fully symmetric with top-level pages
- - some smoke/bootstrap tests are intentionally shallow

## Key Gaps

1. Add direct unit coverage for nested route pages:
   - events/new, events/[id], recipes/new, recipes/[id]
2. Increase assertion depth in thin smoke/bootstrap tests where practical.

## Confidence and Assumptions

- Confidence: high
- Assumptions:
  - endpoint normalization maps concrete UUID samples in tests to parameterized paths
  - coverage mapping is based on explicit request evidence in app.inject usage

## Final Verdict (Test Coverage Audit)

PASS

Rationale: strict endpoint coverage and no-mock integration evidence are strong; remaining issues are depth improvements, not coverage failures.

---

# README Audit

## README Location Check

- Required file exists: repo/README.md

## Hard Gates

### Formatting

- PASS
- Evidence: clear markdown hierarchy, tables, and command blocks.

### Startup Instructions (fullstack/backend requirement)

- PASS
- Evidence: repo/README.md includes docker compose up --build and explicitly mentions docker-compose equivalent.

### Access Method

- PASS
- Evidence: service URLs are provided:
  - frontend http://localhost:5173
  - backend API http://localhost:3000

### Verification Method

- PASS
- Evidence:
  - Manual Verification Required section exists.
  - Includes concrete curl API checks (/health, /auth/login, /auth/me, /events, /attachments, /admin/cache/stats) and UI checks.

### Environment Rules (no runtime installs/manual DB setup)

- PASS
- Evidence:
  - startup and testing flows are Docker compose/container-based
  - no manual DB setup instructions required for normal operation

### Demo Credentials (auth exists)

- PASS
- Evidence:
  - Seed/Demo Accounts section provides usernames, passwords, and roles.
  - Authentication endpoint behavior documented.

## Engineering Quality Assessment

- Tech stack clarity: strong
- Architecture explanation: strong (diagram + module map)
- Testing instructions: strong (full suite and per-suite commands)
- Security/roles: good (role matrix and seeded-account warnings)
- Workflow/presentation quality: strong and reviewer-oriented

## High Priority Issues

- None

## Medium Priority Issues

1. The route/module map is extensive; it can drift from implementation if not kept synchronized.
2. Mixed command forms (docker compose vs docker-compose) can still confuse some environments, though README explains equivalence.

## Low Priority Issues

1. Some long sections increase maintenance surface area and could benefit from periodic pruning to reduce drift risk.

## Hard Gate Failures

- None

## README Verdict

PASS

Rationale: all strict hard gates pass for a fullstack project.

---

## Combined Final Verdicts

1. Test Coverage Audit: PASS
2. README Audit: PASS
