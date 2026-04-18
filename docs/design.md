# System Design

## 1) Architecture Overview

The Hospitality Operations Management System is a full-stack operations platform for corporate catering and venue workflows.

It is organized as a layered monolith backend with a separate SPA frontend:

- Frontend: SvelteKit app (port 5173)
- API: Fastify service (port 3000)
- Primary datastore: PostgreSQL 15
- Cache and transient coordination: Redis 7
- Background/ops utilities: scheduler, backup, circuit-breaker, image processing plugins

High-level runtime flow:

1. Frontend calls backend REST endpoints.
2. Fastify routes validate/authenticate/authorize requests.
3. Service layer enforces business rules and state transitions.
4. Repository layer issues SQL (Knex) to PostgreSQL.
5. Cache plugin serves/invalidates hot reads in Redis.
6. Audit records are appended for traceability.

## 2) Layered Architecture

The backend intentionally separates concerns into clear layers.

### API Layer (transport and contracts)

Location:
- backend/src/auth/routes.js
- backend/src/modules/*/routes.js
- backend/src/middleware/

Responsibilities:
- HTTP route declarations
- Request/response schema validation (Zod + validation middleware)
- Authentication (JWT bearer)
- Authorization (permission checks)
- Status code mapping and response envelope formatting

### Business Layer (domain logic)

Location:
- backend/src/modules/*/service.js
- backend/src/shared/

Responsibilities:
- Domain workflows (event lifecycle, approvals, reservation state machine)
- Object-level access checks
- Budget and policy enforcement
- Idempotency behavior (entitlement redemption)
- Audit write orchestration

### Data Access Layer

Location:
- backend/src/modules/*/repository.js
- backend/src/db/connection.js
- backend/src/db/migrations/
- backend/src/db/seeds/

Responsibilities:
- SQL query composition through Knex
- Persistence abstractions for each module
- DB migration and seed execution
- Transaction boundaries where required

### Cross-Cutting Platform Layer

Location:
- backend/src/plugins/
- backend/src/logging/
- backend/src/config/index.js

Responsibilities:
- Cache abstraction (Redis or memory fallback)
- Circuit breaker for unstable downstream calls
- Scheduler jobs (snapshots, backups, key cleanup)
- Structured logging and centralized configuration

## 3) Directory Structure Responsibilities

### Root

- repo/README.md: onboarding, architecture, run/test instructions
- repo/docker-compose.yml: local runtime topology and service env wiring
- repo/docker-compose.test.yml: isolated test orchestration
- repo/docs/: reviewer-facing documentation and traceability artifacts

### Backend

- backend/src/app.js: Fastify app factory, plugin registration, global hooks, centralized error handler
- backend/src/server.js: process bootstrap (migrations, cache init, scheduler init, graceful shutdown)
- backend/src/config/: typed config normalization from environment variables
- backend/src/db/: connection, migrations, seeds, shared persistence helpers
- backend/src/auth/: registration/login/refresh/logout and identity endpoints
- backend/src/middleware/: authenticate, authorize, validate middleware
- backend/src/modules/: feature modules (routes/service/repository)
- backend/src/plugins/: cache, scheduler, circuit breaker, image processor
- backend/src/shared/: shared domain utilities (errors, encryption, pagination, audit)
- backend/tests/: unit + integration test suites

### Frontend

- frontend/src/routes/: user-facing page routes and workflow screens
- frontend/src/lib/api/: API client utilities
- frontend/src/lib/stores/: session/app state stores
- frontend/src/lib/schemas/: client-side schemas aligned with backend contracts
- frontend/tests/: unit and e2e coverage

## 4) Key Design Decisions

### Fastify for backend API

Why:
- High performance with low overhead in Node.js
- Plugin model maps cleanly to module boundaries
- Strong request lifecycle hooks and error handling support

Tradeoff accepted:
- Requires explicit schema and plugin discipline, but this improves consistency.

### PostgreSQL as system of record

Why:
- ACID guarantees for multi-step workflows (approvals, reservations, entitlement redemption)
- Mature indexing/constraint model for relational business domains
- Reliable backup/restore tooling for ops and audit expectations

Tradeoff accepted:
- More schema governance overhead than document stores, offset by stronger integrity.

### Redis cache layer

Why:
- Reduces repeated reads for stable/high-traffic lookups (catalog trees, entitlement type metadata)
- Supports explicit invalidation by key and pattern on write-path mutations
- Can degrade to in-memory mode for fallback/test scenarios

Tradeoff accepted:
- Cache coherence complexity; mitigated with mutation-triggered invalidation and TTL caps.

### JWT access + refresh token flow

Why:
- Stateless access token verification for low-latency protected routes
- Refresh token rotation reduces replay window and supports revocation semantics
- Fits SPA + API split deployment model

Tradeoff accepted:
- Token lifecycle complexity; mitigated through strict middleware and structured auth errors.

### Layered route/service/repository module pattern

Why:
- Improves testability and separation of responsibilities
- Allows HTTP contracts to evolve with minimal impact on persistence details
- Keeps business rules centralized in service layer

Tradeoff accepted:
- Extra files/abstractions per module; intentionally chosen for maintainability.

### No PgBouncer in current default stack

Current approach:
- The compose setup connects backend directly to PostgreSQL and uses application-level pooling through Knex.

Why this is acceptable here:
- Simpler operational model for the current on-prem/default deployment profile
- Sufficient for expected concurrency in this system baseline

When to introduce PgBouncer:
- If concurrent connection pressure rises significantly, or if many app replicas are introduced, adding PgBouncer becomes a strong next optimization.

## 5) Technology Choices and Justification

- SvelteKit frontend: fast route-centric UI development, low client overhead, clear SSR toggle strategy.
- Fastify backend: plugin-friendly and high-throughput Node API framework with robust hooks.
- Knex query builder: consistent SQL generation and migration tooling without sacrificing explicit schema control.
- PostgreSQL 15: transactional consistency, robust relational modeling, operational maturity.
- Redis 7: low-latency cache operations with predictable key/TTL behavior.
- Argon2 for password hashing: modern memory-hard algorithm for credential security.
- AES-256-GCM for sensitive field encryption: authenticated encryption with integrity guarantees.
- Docker Compose: reproducible local/runtime parity and one-command startup.

## 6) End-to-End Data Flow

### Example: protected state transition request

Scenario: a manager closes an event.

1. Client sends PATCH/POST transition request with `Authorization: Bearer <access-token>`.
2. Fastify route handler runs middleware chain:
   - authenticate: verify JWT, attach user claims
   - authorize: verify required permission(s)
   - validate: validate params/body/query schema
3. Route calls service method for transition.
4. Service verifies object-level access, current state, and transition validity.
5. Repository executes SQL update(s) in PostgreSQL.
6. Service appends immutable audit event.
7. Cache plugin invalidates affected keys/patterns (if route mutates cached domain data).
8. Route returns standardized success envelope.
9. If any error occurs, global error handler emits uniform error format with requestId.

### Example: read-heavy catalog request

1. Client requests catalog tree.
2. Service first checks cache key.
3. On hit, return cached payload.
4. On miss, query PostgreSQL, store result with TTL, return payload.
5. Mutating catalog endpoints invalidate relevant cache namespaces.

## 7) Operational and Reliability Design

- Health endpoint includes DB connectivity diagnostics.
- Graceful shutdown closes scheduler, HTTP server, and cache resources.
- Circuit breaker supports failure isolation for external integrations.
- Scheduled jobs handle snapshot/backup and key cleanup automation.
- Backup retention policy and drill tracking support disaster recovery verification.

## 8) Security by Design

- Authentication: JWT bearer middleware on protected routes.
- Authorization: permission-based plus object-level checks in service layer.
- Validation: request schemas enforced before business execution.
- Encryption: sensitive fields encrypted with AES-256-GCM.
- Auditing: append-only event trail for compliance and forensics.
- Error discipline: structured error responses with machine code and request correlation ID.

## 9) Design Constraints and Evolution Path

Current constraints:
- Monolithic backend process (modular, not microservices).
- Cache invalidation relies on application-managed key discipline.
- OpenAPI and implemented routes should be kept continuously synchronized.

Likely future evolutions:
- Introduce PgBouncer for larger-scale connection multiplexing.
- Expand async job queue isolation for heavier background workloads.
- Tighten generated API docs pipeline to eliminate spec/runtime drift.
