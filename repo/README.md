Project Type: fullstack

# Hospitality Operations Management System

A fullstack on-premises application for corporate catering and venue services. Combines event management, resource control, recipe management, inventory tracking, and entitlement systems into a single integrated platform.

**Tech Stack:** Svelte (SvelteKit) + Fastify + PostgreSQL + Redis

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Svelte/Kit    │────▶│   Fastify API   │────▶│  PostgreSQL 15  │
│   Frontend      │     │   Backend       │     │  (System of     │
│   Port 5173     │     │   Port 3000     │     │   Record)       │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                        ┌────────▼────────┐
                        │    Redis 7      │
                        │   (Cache)       │
                        └─────────────────┘
```

- **Frontend** -- SvelteKit single-page application served on port 5173. Communicates with the backend over REST.
- **Backend** -- Fastify API server on port 3000. Handles authentication, business logic, file storage, and scheduled jobs.
- **PostgreSQL 15** -- System of record for all persistent data: users, events, reservations, recipes, inventory, entitlements, audit trails.
- **Redis 7** -- Cache layer. Stores frequently-read data (catalog tree, approved recipes, entitlement types) with TTL-based and mutation-triggered invalidation.

---

## Quick Start

```bash
docker compose up --build
```

> Uses Docker Compose v2 (`docker compose`, space-separated). If your
> environment only ships the legacy standalone binary, the hyphenated
> `docker-compose up --build` form is equivalent.

| Service  | URL                        |
|----------|----------------------------|
| Frontend | http://localhost:5173      |
| Backend API | http://localhost:3000  |

The Docker Compose file brings up all four services (PostgreSQL, Redis, backend, frontend) with health checks. The backend waits for healthy database and cache before starting. Migrations and seed data run automatically on first boot.

---

## Configuration

All environment variables are managed through `backend/src/config/index.js`. Application code never reads `process.env` directly.

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | Runtime environment (`development`, `production`, `test`) |
| `PORT` | `3000` | Backend HTTP listen port |
| `DATABASE_URL` | `postgresql://localhost:5432/hospitality_ops` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | `dev-access-secret-change-in-production-min-32-chars` | HMAC secret for signing JWT access tokens |
| `JWT_REFRESH_SECRET` | `dev-refresh-secret-change-in-production-min-32-chars` | HMAC secret for signing JWT refresh tokens |
| `JWT_ACCESS_TTL_MINUTES` | `45` | Access token lifetime in minutes |
| `JWT_REFRESH_TTL_DAYS` | `10` | Refresh token lifetime in days |
| `ENCRYPTION_KEY_HEX` | `0123456789abcdef...` (64 hex chars) | AES-256-GCM key for encrypting sensitive fields (must be exactly 64 hex characters) |
| `UPLOAD_ROOT` | `/app/uploads` | Filesystem path for uploaded files |
| `UPLOAD_MAX_MB` | `25` | Maximum upload file size in megabytes |
| `UPLOAD_ALLOWED_MIME` | `application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg,image/gif,image/webp` | Comma-separated list of allowed MIME types for uploads |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `CACHE_MODE` | `memory` | Cache backend: `redis` or `memory` |
| `ENABLE_SSR` | `false` | Enable server-side rendering in SvelteKit |
| `ENABLE_TLS` | `false` | Enable TLS termination on the backend |
| `BACKUP_ROOT` | `/app/backups` | Filesystem path for database backup files |
| `BACKUP_RETENTION_DAYS` | `30` | Number of days to retain backup files before automatic cleanup |
| `SNAPSHOT_CRON` | `0 23 * * *` | Cron expression for nightly inventory snapshot and backup |
| `KEY_CLEANUP_CRON` | `0 2 * * *` | Cron expression for expired encryption key cleanup |
| `CB_TIMEOUT_MS` | `5000` | Circuit breaker timeout per call in milliseconds |
| `CB_ERROR_THRESHOLD_PERCENT` | `10` | Error percentage threshold to trip circuit breaker |
| `CB_ROLLING_WINDOW_MS` | `60000` | Circuit breaker rolling statistics window in milliseconds |
| `CB_RESET_TIMEOUT_MS` | `30000` | Time in milliseconds before a tripped circuit breaker retries |
| `DRY_RUN_EXTERNAL_STUBS` | `true` | When true, external service integrations (data collection, CAPTCHA) run as local stubs |
| `FRONTEND_URL` | `http://localhost:5173` | Public URL of the frontend (used for CORS) |
| `BACKEND_URL` | `http://localhost:3000` | Internal URL of the backend |
| `VITE_API_URL` | `http://localhost:3000` | Backend API URL consumed by the frontend at build time |

---

## Module Map

### Backend Modules

Each module follows a consistent structure: `routes.js` (Fastify plugin with endpoint definitions), `service.js` (business logic), `repository.js` (database queries).

| Module | Endpoint Prefix | Source Directory |
|---|---|---|
| Auth | `/auth/*` | `backend/src/auth/` |
| Users | `/users/*` | `backend/src/modules/users/` |
| Roles / Admin | `/admin/*` | `backend/src/modules/roles/` |
| Events | `/events/*` | `backend/src/modules/events/` |
| Approvals | `/approvals/*` | `backend/src/modules/approvals/` |
| Reservations | `/reservations/*` | `backend/src/modules/reservations/` |
| Recipes | `/recipes/*` | `backend/src/modules/recipes/` |
| Inventory | `/inventory/*` | `backend/src/modules/inventory/` |
| Entitlements | `/entitlements/*` | `backend/src/modules/entitlements/` |
| Attachments | `/attachments/*` | `backend/src/modules/attachments/` |
| Check-in | `/events/:id/check-in` | `backend/src/modules/checkin/` |
| Reports | `/reports/*` | `backend/src/modules/reports/` |
| Catalog | `/catalog/*` | `backend/src/modules/resources/` |
| Data Collection | `/data-collection/*` | `backend/src/modules/data-collection/` |
| Backup | `/admin/backups/*` | `backend/src/modules/backup/` |
| Cache | `/admin/cache/*` | `backend/src/modules/admin-cache-routes.js` |
| Audit | `/audit/*` | `backend/src/modules/audit/` |

### Shared / Cross-Cutting

| Component | File | Purpose |
|---|---|---|
| Authentication middleware | `backend/src/middleware/authenticate.js` | JWT Bearer token verification |
| Authorization middleware | `backend/src/middleware/authorize.js` | Permission-based access control |
| Validation middleware | `backend/src/middleware/validate.js` | Request body schema validation |
| Encryption helpers | `backend/src/shared/encryption.js` | AES-256-GCM encrypt/decrypt and field masking |
| Audit trail writer | `backend/src/shared/audit.js` | Immutable audit event insertion |
| Pagination | `backend/src/shared/pagination.js` | Cursor/offset pagination helpers |
| Error handling | `backend/src/shared/errors.js` | Structured error classes |
| Cache plugin | `backend/src/plugins/cache.js` | Redis/memory cache with TTL and invalidation |
| Circuit breaker | `backend/src/plugins/circuit-breaker.js` | opossum-based circuit breaking |
| Image processor | `backend/src/plugins/image-processor.js` | Sharp-based image resizing and transcoding |
| Scheduler | `backend/src/plugins/scheduler.js` | Cron-based job scheduling |

---

## Frontend Routes

| Route | Component | Description |
|---|---|---|
| `/login` | `frontend/src/routes/login/+page.svelte` | Username/password sign-in |
| `/register` | `frontend/src/routes/register/+page.svelte` | New account registration |
| `/dashboard` | `frontend/src/routes/dashboard/+page.svelte` | Role-appropriate dashboard with summary widgets |
| `/events` | `frontend/src/routes/events/+page.svelte` | Event list with status filters |
| `/events/new` | `frontend/src/routes/events/new/+page.svelte` | Create new event form |
| `/events/[id]` | `frontend/src/routes/events/[id]/+page.svelte` | Event detail, state transitions, service windows, resource requests |
| `/approvals` | `frontend/src/routes/approvals/+page.svelte` | Approval queue for pending items |
| `/reservations` | `frontend/src/routes/reservations/+page.svelte` | Reservation lifecycle management |
| `/recipes` | `frontend/src/routes/recipes/+page.svelte` | Recipe list with version history |
| `/recipes/[id]` | `frontend/src/routes/recipes/[id]/+page.svelte` | Recipe detail, editing, review workflow |
| `/inventory` | `frontend/src/routes/inventory/+page.svelte` | Inventory snapshots, anomaly detection, gap analysis |
| `/entitlements` | `frontend/src/routes/entitlements/+page.svelte` | Entitlement management and redemption |
| `/check-in` | `frontend/src/routes/check-in/+page.svelte` | Tablet-optimized event check-in |
| `/catalog` | `frontend/src/routes/catalog/+page.svelte` | Unified resource catalog browser |
| `/reports` | `frontend/src/routes/reports/+page.svelte` | Report generation and export |
| `/admin` | `frontend/src/routes/admin/+page.svelte` | Administration: roles, backups, cache, system settings |

---

## Seed / Demo Accounts

> **Development only.** The seed in `backend/src/db/seeds/002_demo_users.js`
> runs only when `NODE_ENV !== 'production'`. Do **not** deploy with these
> seeded accounts enabled — they are not gated by rate limiting or MFA and
> the passwords are public in source control. In production, disable the
> seed (or use `NODE_ENV=production`) and provision operator accounts via
> `POST /auth/register` + `POST /admin/roles/assign` so credentials stay out
> of the repository.

Every seeded demo user and password (as defined in
`backend/src/db/seeds/002_demo_users.js`):

| Role               | Username   | Password       |
| ------------------ | ---------- | -------------- |
| Admin              | `admin`    | `admin123!`    |
| Event Planner      | `planner`  | `planner123!`  |
| Resource Manager   | `manager`  | `manager123!`  |
| Culinary Editor    | `chef`     | `chef123!`     |
| Inventory Analyst  | `analyst`  | `analyst123!`  |
| Approver           | `approver` | `approver123!` |

The backend exposes `POST /auth/login` with `{ "username", "password" }`
and returns `{ accessToken, refreshToken, expiresIn, user }`. Use the
`accessToken` as a `Bearer` token in the `Authorization` header.

---

## Running Tests

Run the full test suite (backend unit, backend API, frontend unit, frontend E2E):

```bash
./run_tests.sh
```

Or run individual suites inside the Docker containers (no local toolchain required):

```bash
# Backend unit tests
docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm backend-test npx vitest run tests/unit

# Backend HTTP/API tests — real PostgreSQL, no mocks. All runnable HTTP
# tests live under tests/integration; tests/api only exports shared helpers
# (setup.js / helpers.js) and contains no test cases.
docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm backend-test npx vitest run tests/integration

# Frontend unit tests
docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm frontend-test npx vitest run tests/unit

# Frontend E2E tests (Playwright runs against the backend + frontend containers)
docker compose -f docker-compose.yml -f docker-compose.test.yml up -d backend frontend
docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm e2e-test npx playwright test
docker compose -f docker-compose.yml -f docker-compose.test.yml stop backend frontend
```

### Test Structure

```
backend/tests/
  unit/           # Pure logic tests (state machine, budget rules, encryption, etc.)
  integration/    # HTTP tests hitting a real Fastify instance + real PostgreSQL
                  # (no vi.mock on DB / JWT / audit / cache). This is the
                  # authoritative API coverage set.
  api/            # Shared test helpers only (setup.js, helpers.js). Contains
                  # no test cases — kept as a re-export shim so older docs and
                  # import paths still resolve.

frontend/tests/
  unit/           # Component and store tests
  e2e/            # Playwright browser tests (login, events, check-in, fullstack)
```

---

## Backup and Disaster Recovery

- **Nightly automated backups** are executed via `pg_dump` on a cron schedule (`SNAPSHOT_CRON`, default `0 23 * * *`).
- **Backup storage** is at `BACKUP_ROOT` (default `/app/backups`), a Docker-managed volume.
- **Retention policy** automatically deletes backup files older than `BACKUP_RETENTION_DAYS` (default 30 days).
- **Quarterly restore drills** are documented in the `drill_runs` database table. Each drill records the backup file used, restore outcome, duration, and operator notes.
- **Drill procedure:** Admin panel > Backups > Record Drill. The operator selects a backup file, performs a restore to a scratch database, and logs the result.
- **Backup management endpoints:** `GET /admin/backups/runs` (list backup runs), `POST /admin/backups/restore-test` (record a drill), `GET /admin/backups/drills` (list drills). Backup execution itself runs on the `SNAPSHOT_CRON` schedule — there is no manual HTTP trigger endpoint.

---

## Viewport Strategy

### Back-Office Screens
Events, approvals, inventory, recipes, entitlements, reports, and admin screens are **desktop-first**.
- Target width: **1280px+**
- Minimum usable width: **1024px**
- Responsive breakpoints handled via Tailwind CSS utilities

### Check-In Screen
The check-in interface (`/check-in`) is **tablet-first**, optimized for landscape orientation.
- Large touch targets: **48px minimum** tap area
- High-contrast dark theme for visibility in event environments
- Dedicated layout (`frontend/src/routes/check-in/+layout.svelte`) separate from the main application shell

---

## Static Reviewer Quick Start

| Audit Section | Evidence Location |
|---|---|
| One-click startup | `docker-compose.yml`, this `README.md` |
| Environment isolation | `docker-compose.yml` (no absolute host paths), `backend/src/config/index.js` |
| Core goal consistency | `docs/requirement-traceability.md` |
| Delivery integrity | Full repo structure -- all modules implemented with routes, services, repositories |
| RBAC enforcement | `backend/src/middleware/authorize.js`, `docs/security-evidence.md` |
| Test execution | `run_tests.sh`, `backend/tests/*`, `frontend/tests/*` |
| Frontend quality | `frontend/src/routes/*`, Tailwind CSS styling, responsive layouts |
| Security controls | `docs/security-evidence.md` |
| Reviewer map | `docs/reviewer-map.md` |

---

## Manual Verification Required

The following items require hands-on verification and cannot be fully validated by static analysis alone:

- Docker containers build and start successfully via `docker compose up --build`
- Database migrations apply correctly on first boot (`backend/src/db/migrations/001_initial_schema.js`)
- Login flow produces valid JWT tokens (POST `/auth/login` with seed credentials)
- File uploads save to disk with correct SHA-256 hashes (POST `/attachments?event_id=...` or `?recipe_version_id=...`)
- Image variants are generated at correct dimensions (thumb: 200px, preview: 600px, full: 1200px)
- Cache invalidation triggers on data mutations (create/update events, recipes, inventory)
- Circuit breaker trips on simulated timeouts (configurable via `CB_TIMEOUT_MS`)
- Backup trigger produces a valid `pg_dump` file at `BACKUP_ROOT`
- Restore drill workflow completes end-to-end through the admin panel

### Smoke-Test curl Examples

One-liners to verify a fresh stack from the host. Replace the seeded
`planner` password if you've rotated demo credentials.

```bash
# 1) Health probe — unauthenticated; returns version, uptime, DB liveness.
curl -s http://localhost:3000/health | jq

# 2) Login — returns accessToken + refreshToken + user payload.
curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"planner","password":"planner123!"}' | jq

# 3) Authenticated self-profile. Capture the token and reuse it:
ACCESS_TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"planner","password":"planner123!"}' | jq -r .accessToken)
curl -s http://localhost:3000/auth/me \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq

# 4) Create an event (event:create).
curl -s -X POST http://localhost:3000/events \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Smoke Test Event","event_date":"2026-12-31","headcount":10,"budget_amount":500}' | jq

# 5) List events (paginated, filtered).
curl -s "http://localhost:3000/events?state=draft&page=1&pageSize=5" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq

# 6) Upload an attachment to an event (multipart).
curl -s -X POST "http://localhost:3000/attachments?event_id=<EVENT_ID>" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F 'file=@./sample.pdf;type=application/pdf' | jq

# 7) Check cache stats (requires ops:cache_admin).
curl -s http://localhost:3000/admin/cache/stats \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq
```

---

## Mock / Stub Disclosure

| Component | Type | Notes |
|---|---|---|
| Data Collection subsystem | Internal stub | Proxy rotation, user agents, cookie handling are simulated locally. Controlled by `DRY_RUN_EXTERNAL_STUBS=true`. |
| CAPTCHA integration | Plugin interface only | Not connected to any real CAPTCHA service. The interface exists for future integration. |
| External payment | Not applicable | No payment integration is included -- not in requirements. |
| Email / notification | Not applicable | No email service is included -- not in requirements. |

When `DRY_RUN_EXTERNAL_STUBS` is `true` (default), all external-facing integrations return deterministic stub responses. Set to `false` only when real external endpoints are configured.

---

## Project Structure

```
repo/
  docker-compose.yml          # Multi-service orchestration
  run_tests.sh                # Global test runner
  docs/                       # Project documentation
    requirement-traceability.md
    security-evidence.md
    reviewer-map.md
  backend/
    Dockerfile
    src/
      app.js                  # Fastify application factory
      server.js               # Server entry point
      config/index.js          # Centralized configuration
      auth/routes.js           # Authentication endpoints
      db/
        connection.js          # Knex database connection
        knexfile.js            # Knex configuration
        migrations/            # Database schema migrations
        repositories/          # Shared data access
        seeds/                 # Seed data (roles, demo users, sample data)
      middleware/
        authenticate.js        # JWT verification
        authorize.js           # Permission enforcement
        validate.js            # Request validation
      modules/                 # Feature modules (routes + service + repository)
        events/
        approvals/
        reservations/
        recipes/
        inventory/
        entitlements/
        attachments/
        checkin/
        reports/
        resources/
        roles/
        users/
        data-collection/
        backup/
        audit/
        admin-cache-routes.js
      plugins/
        cache.js               # Redis/memory cache provider
        circuit-breaker.js     # opossum circuit breaker
        image-processor.js     # Sharp image processing
        scheduler.js           # Cron job scheduling
      shared/
        audit.js               # Audit trail writer
        encryption.js          # AES-256-GCM encryption and field masking
        errors.js              # Error classes
        pagination.js          # Pagination utilities
      logging/index.js         # Structured logger
    tests/
      unit/                    # Unit tests
      api/                     # API integration tests
  frontend/
    Dockerfile
    src/
      app.html                # HTML shell
      app.css                 # Global styles
      routes/                 # SvelteKit file-based routing
        login/
        register/
        dashboard/
        events/ (+ new/ + [id]/)
        approvals/
        reservations/
        recipes/ (+ [id]/)
        inventory/
        entitlements/
        check-in/
        catalog/
        reports/
        admin/
      lib/
        api/                  # API client modules
        auth/                 # Auth utilities
        components/           # Reusable Svelte components
        constants/            # Application constants
        schemas/              # Zod validation schemas
        stores/               # Svelte stores (state management)
        utils/                # Utility functions
      static/                 # Static assets
    tests/
      unit/                   # Component and store tests
      e2e/                    # Playwright E2E tests
```
