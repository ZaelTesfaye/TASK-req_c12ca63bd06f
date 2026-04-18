# Reviewer Map

This document maps each audit section from the self-test checklist to specific evidence locations in the repository. Designed for static reviewers who need to locate proof of compliance quickly.

**Project Type:** Full-stack (Svelte/SvelteKit frontend + Fastify backend + PostgreSQL + Redis)

---

## Hard Gates

| Gate | Status | Evidence |
|---|---|---|
| One-click startup | Pass | `docker-compose.yml` -- `docker-compose up --build` brings up all four services (PostgreSQL, Redis, backend, frontend) with health checks and dependency ordering. No manual steps required. |
| Environment isolation | Pass | `docker-compose.yml` uses no absolute host paths. All paths are relative (`./backend`, `./frontend`) or Docker-managed volumes (`pg_data`, `uploads`, `backups`). `backend/src/config/index.js` reads all config from environment variables with safe defaults. |
| README present | Pass | `README.md` at repo root with architecture, quick start, configuration, module map, seed accounts, test instructions. |
| Tests executable | Pass | `run_tests.sh` runs backend unit, backend API, frontend unit, and frontend E2E suites. Individual suites runnable via `npx vitest run`. |

---

## Delivery Integrity

| Check | Evidence Location | Notes |
|---|---|---|
| All backend modules implemented | `backend/src/modules/` -- 16 module directories each containing routes (and service/repository where applicable) | Events, approvals, reservations, recipes, inventory, entitlements, attachments, checkin, reports, resources, roles, users, data-collection, backup, audit, admin-cache-routes |
| All frontend routes implemented | `frontend/src/routes/` -- 14 route directories | login, register, dashboard, events (+ new, [id]), approvals, reservations, recipes (+ [id]), inventory, entitlements, check-in, catalog, reports, admin |
| Database schema | `backend/src/db/migrations/001_initial_schema.js` | Single migration covering all tables |
| Seed data | `backend/src/db/seeds/` -- 4 seed files | Roles/permissions, demo users, entitlement types/rules, sample data |
| Auth endpoints | `backend/src/auth/routes.js` | register, login, refresh, logout, me |
| Middleware chain | `backend/src/middleware/` | authenticate.js, authorize.js, validate.js |
| Cross-cutting concerns | `backend/src/shared/` | audit.js, encryption.js, errors.js, pagination.js |
| Plugins | `backend/src/plugins/` | cache.js, circuit-breaker.js, image-processor.js, scheduler.js |

---

## Engineering Quality

| Check | Evidence Location | Notes |
|---|---|---|
| Centralized config | `backend/src/config/index.js` | All 26+ env vars read through helper functions. No direct `process.env` access elsewhere. Production requires secrets; development has safe defaults. |
| Structured logging | `backend/src/logging/index.js` | Logger factory used across all modules. Logs include action, context, and structured data. |
| Error handling | `backend/src/shared/errors.js` | Structured error classes with consistent API response format (code, message, details, requestId). |
| Database access pattern | `backend/src/db/connection.js`, `backend/src/db/knexfile.js` | Knex.js with parameterized queries. Repositories encapsulate all SQL. |
| State machines | `backend/src/modules/events/service.js`, `backend/src/modules/reservations/service.js` | Explicit valid-transition maps. Invalid transitions rejected with clear errors. |
| Idempotency | `backend/src/modules/entitlements/service.js` | Idempotency key on redemption prevents double-processing. |
| Cache strategy | `backend/src/plugins/cache.js` | Named cache keys, defined TTLs, mutation-triggered invalidation, SCAN-based pattern delete for Redis. |
| Circuit breaking | `backend/src/plugins/circuit-breaker.js` | Named breakers, configurable thresholds, fallback responses, state-transition logging. |
| Image processing | `backend/src/plugins/image-processor.js` | Three variants (thumb 200px, preview 600px, full 1200px), MIME validation, metadata extraction. |

---

## Security

| Check | Evidence Location | Notes |
|---|---|---|
| Authentication | `backend/src/middleware/authenticate.js` | JWT Bearer verification on all protected routes. 401 on missing/invalid/expired tokens. |
| Authorization (permission-level) | `backend/src/middleware/authorize.js` | Factory function checks user permissions array against required codes. 403 on insufficient permissions. |
| Authorization (object-level) | `backend/src/modules/events/service.js`, `backend/src/modules/approvals/service.js` | Creator-only edit, manager scope, no self-approval. |
| Password hashing | `backend/src/auth/routes.js` | argon2id via `argon2` library. |
| Encryption at rest | `backend/src/shared/encryption.js` | AES-256-GCM, 96-bit random IV, 128-bit auth tag, hex key validated at startup. |
| Field masking | `backend/src/shared/encryption.js` | `maskField()` for employee_id, phone, email. Used in API responses. |
| Input validation | `backend/src/middleware/validate.js`, `backend/src/auth/routes.js` | Zod schemas on all endpoints. 422 on validation failure. |
| Upload security | `backend/src/modules/attachments/service.js` | Size limit (25MB), MIME allowlist, SHA-256 integrity hash. |
| Token rotation | `backend/src/auth/routes.js` | Refresh tokens are single-use with rotation tracking. |
| Audit immutability | `backend/src/shared/audit.js`, `backend/src/modules/audit/routes.js` | Insert-only audit trail. No update/delete endpoints. |
| Full security documentation | `docs/security-evidence.md` | Comprehensive security controls catalog. |

---

## Tests

| Check | Evidence Location | Notes |
|---|---|---|
| Test runner | `run_tests.sh` | Orchestrates all test suites with summary output. |
| Backend unit tests | `backend/tests/unit/` | 10 test files: state-machine, budget-rules, encryption, attachment-validation, catalog-validation, config, entitlement-redemption, errors, overtime, pagination. |
| Backend API tests | `backend/tests/api/` | 12 test files: auth, authorization, admin, events, approvals, reservations, recipes, inventory, entitlements, attachments, checkin. Includes test helpers and setup. |
| Frontend unit tests | `frontend/tests/unit/` | 7 test files + subdirectories: api-client, auth-store, form-validation, permissions, route-guards, state-rendering, utils. |
| Frontend E2E tests | `frontend/tests/e2e/` | 4 test files: login, events, checkin, navigation. Playwright-based. |

---

## Frontend Quality

| Check | Evidence Location | Notes |
|---|---|---|
| Component architecture | `frontend/src/lib/components/` | Reusable Svelte components. |
| State management | `frontend/src/lib/stores/` | Svelte stores for application state. |
| API client | `frontend/src/lib/api/` | Centralized API communication layer. |
| Validation schemas | `frontend/src/lib/schemas/` | Zod schemas matching backend validation. |
| Auth utilities | `frontend/src/lib/auth/` | Token management, auth state. |
| Constants | `frontend/src/lib/constants/` | Application-wide constants. |
| Utility functions | `frontend/src/lib/utils/` | Shared utility functions. |
| Responsive design | `frontend/src/routes/check-in/+layout.svelte` | Tablet-first check-in layout. Desktop-first for all other routes. |
| Route structure | `frontend/src/routes/` | SvelteKit file-based routing with nested layouts. |
| Styling | Tailwind CSS | Utility-first CSS framework for consistent styling. |

---

## Fail-Risk Precheck

Items that a reviewer should verify first because they are most likely to cause a fail if broken:

| Risk Area | What to Check | Where to Look | Failure Mode |
|---|---|---|---|
| Docker startup | Containers build and start without errors | `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile` | Build failure, health check timeout, port conflict |
| Database migration | Schema applies cleanly on first boot | `backend/src/db/migrations/001_initial_schema.js` | Migration error blocks all API operations |
| Seed data | Demo accounts are created with correct roles | `backend/src/db/seeds/001_roles_permissions.js`, `backend/src/db/seeds/002_demo_users.js` | Login fails, RBAC tests fail |
| Auth flow | Login returns valid JWT, refresh rotates correctly | `backend/src/auth/routes.js` | All protected endpoints return 401 |
| RBAC enforcement | Unauthorized users get 403 | `backend/src/middleware/authorize.js`, `backend/tests/api/authorization.test.js` | Security gate failure |
| State machine | Event transitions follow valid paths only | `backend/src/modules/events/service.js`, `backend/tests/unit/state-machine.test.js` | Invalid state transitions allowed |
| Test execution | All test suites pass | `run_tests.sh` | Test failures indicate broken functionality |
| Environment variables | No hardcoded secrets, config reads from env | `backend/src/config/index.js` | Security exposure, deployment failure |
| File uploads | SHA-256 computed, size/MIME enforced | `backend/src/modules/attachments/service.js` | Integrity check failure, oversized uploads |
| Encryption key | 64 hex chars validated at startup | `backend/src/config/index.js` | App crashes on boot with bad key |

---

## Quick Verification Checklist

For a rapid pass/fail assessment, verify these in order:

1. `docker-compose up --build` succeeds (all 4 services healthy)
2. `POST /auth/login` with `{ "username": "admin", "password": "admin123!" }` returns a JWT
3. Protected endpoint with valid token returns 200
4. Protected endpoint without token returns 401
5. Protected endpoint with insufficient permissions returns 403
6. `./run_tests.sh` completes with all tests passing
7. `docs/requirement-traceability.md` covers all prompt requirements
8. `docs/security-evidence.md` documents all security controls
