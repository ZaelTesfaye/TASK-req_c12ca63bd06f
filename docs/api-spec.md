# API Specification (External-Facing Endpoints)

This document describes external API contracts for the backend service.

Scope:

- Canonical base path in OpenAPI: `/api`
- Implemented runtime endpoints in backend route modules
- Authentication/authorization model
- Request/response contracts
- Standard error envelope

Note on source of truth:

- OpenAPI path inventory in `backend/docs/openapi.yaml`
- Runtime route registration in `backend/src/auth/routes.js`, `backend/src/modules/**/routes.js`, and `backend/src/app.js`

## 1) Global API Conventions

### 1.1 Base URL

- Logical API prefix: `/api`
- Example full URL: `http://localhost:3000/api/events`

### 1.2 Common Headers

- `Content-Type: application/json` for JSON request bodies
- `Authorization: Bearer <jwt-access-token>` for protected endpoints
- `Accept: application/json`
- `Idempotency-Key: <string>` where explicitly supported (for safe retries on mutation actions)

### 1.3 Standard Success Envelope

Most endpoints return one of:

- `{ "data": ... }`
- Paginated: `{ "data": [...], "pagination": { "page": number, "pageSize": number, "total": number, "hasMore": boolean } }`

### 1.4 Standard Error Envelope

Primary runtime error structure:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Validation failed",
  "details": { "errors": [] },
  "requestId": "req-123"
}
```

Typical error codes:

- `VALIDATION_ERROR` (422)
- `UNAUTHORIZED` (401)
- `FORBIDDEN` (403)
- `NOT_FOUND` (404)
- `CONFLICT` (409)
- `INTERNAL_ERROR` (500)

### 1.5 Auth and Permission Model

Authentication:

- JWT bearer access token validated by authentication middleware.

Authorization:

- Permission codes (RBAC) validated by authorization middleware.
- Some endpoints also enforce object-level access checks.

Representative permission families:

- Auth/self: `auth:self`
- Events: `event:create`, `event:update`, `event:submit`, `event:approve`, `event:service`, `event:close`
- Reservations: `reservation:request`, `reservation:approve`, `reservation:operate`, `reservation:overtime_approve`
- Recipes: `recipe:create`, `recipe:review`, `recipe:approve`
- Inventory: `inventory:read`, `inventory:resolve_gap`, `inventory:export`
- Entitlements: `entitlement:*`
- Attachments: `attachment:upload`, `attachment:read`
- Admin/Ops: `admin:roles`, `admin:manager_scope`, `ops:*`

## 2) Shared Schemas

### 2.1 AuthRequest.Login

| Field    | Type   | Required |
| -------- | ------ | -------- |
| username | string | yes      |
| password | string | yes      |

### 2.2 AuthResponse.Tokens

| Field        | Type   |
| ------------ | ------ |
| accessToken  | string |
| refreshToken | string |
| expiresIn    | number |
| user         | object |

### 2.3 Event (core)

| Field           | Type                                             |
| --------------- | ------------------------------------------------ |
| id              | uuid                                             |
| title           | string                                           |
| description     | string                                           |
| status          | enum(draft,submitted,approved,in_service,closed) |
| budget          | number                                           |
| created_by      | uuid                                             |
| service_windows | array<object>                                    |
| created_at      | date-time                                        |
| updated_at      | date-time                                        |

### 2.4 Reservation (core)

| Field       | Type                                                                                               |
| ----------- | -------------------------------------------------------------------------------------------------- |
| id          | uuid                                                                                               |
| event_id    | uuid                                                                                               |
| resource_id | uuid                                                                                               |
| status      | enum(requested,approved,released,occupied,returned,overtime_pending,cancelled,rescheduled,renewed) |
| start_time  | date-time                                                                                          |
| end_time    | date-time                                                                                          |
| created_at  | date-time                                                                                          |
| updated_at  | date-time                                                                                          |

### 2.5 RecipeVersion (core)

| Field          | Type                                    |
| -------------- | --------------------------------------- |
| id             | uuid                                    |
| recipe_id      | uuid                                    |
| version_number | integer                                 |
| title          | string                                  |
| ingredients    | array<object>                           |
| steps          | array<string>                           |
| yield_amount   | number                                  |
| yield_unit     | string                                  |
| allergens      | array<string>                           |
| status         | enum(draft,submitted,approved,rejected) |
| created_at     | date-time                               |

### 2.6 Attachment (core)

| Field       | Type      |
| ----------- | --------- |
| id          | uuid      |
| filename    | string    |
| mime_type   | string    |
| size_bytes  | integer   |
| uploaded_by | uuid      |
| created_at  | date-time |

### 2.7 InventorySnapshot (core)

| Field         | Type          |
| ------------- | ------------- |
| id            | uuid          |
| snapshot_date | date          |
| items         | array<object> |
| created_at    | date-time     |

### 2.8 Entitlement (core)

| Field           | Type                                  |
| --------------- | ------------------------------------- |
| id              | uuid                                  |
| type_id         | uuid                                  |
| holder_id       | uuid                                  |
| event_id        | uuid?                                 |
| status          | enum(active,redeemed,expired,revoked) |
| issued_at       | date-time                             |
| redeemed_at     | date-time?                            |
| idempotency_key | string?                               |

## 3) Endpoint Catalog

For each endpoint below:

- Headers: `Authorization` required unless marked Public
- Error format: standard envelope in section 1.4
- Status codes listed are common/expected from runtime + OpenAPI

## 3.1 Health

### GET /health

- Purpose: service and DB health check
- Auth: Public
- Request body: none
- Response 200: status, uptime, version, environment, database connectivity diagnostics
- Status codes: 200
- Example request:

```http
GET /health
```

- Example response:

```json
{ "status": "ok", "database": { "connected": true } }
```

## 3.2 Auth

### POST /auth/register

- Purpose: create new user account
- Auth: Public
- Request body: username, password, role/identity fields depending on profile
- Response 201: created user payload (without raw password)
- Status codes: 201, 400, 409, 422, 500
- Example request:

```json
{ "username": "new.user", "password": "StrongPass123!" }
```

- Example response:

```json
{ "data": { "id": "uuid", "username": "new.user" } }
```

### POST /auth/login

- Purpose: exchange credentials for access/refresh tokens
- Auth: Public
- Request body: `AuthRequest.Login`
- Response 200: `AuthResponse.Tokens`
- Status codes: 200, 401, 422, 500
- Example request:

```json
{ "username": "admin", "password": "admin123!" }
```

- Example response:

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "expiresIn": 2700,
  "user": { "id": "uuid" }
}
```

### POST /auth/refresh

- Purpose: rotate refresh token and mint new access token
- Auth: Public (refresh token required in body/cookie depending client)
- Request body: refreshToken
- Response 200: new token pair
- Status codes: 200, 401, 422, 500
- Example request:

```json
{ "refreshToken": "..." }
```

- Example response:

```json
{ "accessToken": "...", "refreshToken": "...", "expiresIn": 2700 }
```

### POST /auth/logout

- Purpose: invalidate current refresh/session context
- Auth: Protected (`auth:self`)
- Request body: optional refresh token context
- Response 200: confirmation
- Status codes: 200, 401, 500
- Example response:

```json
{ "data": { "loggedOut": true } }
```

### GET /auth/me

- Purpose: current authenticated user profile and permissions
- Auth: Protected (`auth:self`)
- Request body: none
- Response 200: user profile + roles + permissions
- Status codes: 200, 401, 500
- Example response:

```json
{
  "data": {
    "id": "uuid",
    "username": "admin",
    "roles": ["admin"],
    "permissions": ["admin:roles"]
  }
}
```

### POST /auth/change-password

- Purpose: change password for current user
- Auth: Protected (`auth:self`)
- Request body: oldPassword, newPassword
- Response 200: confirmation
- Status codes: 200, 401, 422, 500
- Example request:

```json
{ "oldPassword": "old", "newPassword": "newStrong123!" }
```

## 3.3 Users and Admin Roles

### GET /users

- Purpose: list users (paginated)
- Auth: Protected (`admin:roles`)
- Query: page, pageSize, sortBy, sortDir
- Response 200: paginated user list
- Status codes: 200, 401, 403, 422, 500
- Example: `GET /users?page=1&pageSize=20`

### GET /users/{id}

- Purpose: get single user
- Auth: Protected (self or `admin:roles`)
- Params: id(uuid)
- Response 200: user record
- Status codes: 200, 401, 403, 404, 422, 500

### PATCH /users/{id}/status

- Purpose: update user status
- Auth: Protected (`admin:roles`)
- Body fields:
  - status: enum(active,inactive,suspended), required
- Response 200: updated user
- Status codes: 200, 401, 403, 404, 422, 500
- Example request:

```json
{ "status": "suspended" }
```

### GET /admin/users

- Purpose: admin user listing (legacy/admin alias)
- Auth: Protected (`admin:roles`)
- Response: list users
- Status codes: 200, 401, 403, 500

### POST /admin/users/{id}/roles

- Purpose: assign role to user
- Auth: Protected (`admin:roles`)
- Body fields: roleId/roleCode (required)
- Response 200/201: assignment result
- Status codes: 200, 201, 401, 403, 404, 409, 422, 500

### DELETE /admin/users/{id}/roles

- Purpose: remove role from user
- Auth: Protected (`admin:roles`)
- Body/query: role reference
- Response 200: success
- Status codes: 200, 401, 403, 404, 422, 500

### POST /admin/users/{id}/manager-scope

- Purpose: grant manager scope
- Auth: Protected (`admin:manager_scope`)
- Body: scope/category identifiers
- Response 200/201: scope record
- Status codes: 200, 201, 401, 403, 404, 422, 500

### DELETE /admin/users/{id}/manager-scope

- Purpose: revoke manager scope
- Auth: Protected (`admin:manager_scope`)
- Body/query: scope identifier
- Response 200: success
- Status codes: 200, 401, 403, 404, 422, 500

## 3.4 Events

### GET /events

- Purpose: list visible events
- Auth: Protected (`event:read`)
- Query: pagination + filters
- Response 200: paginated `Event[]`
- Status codes: 200, 401, 403, 422, 500

### POST /events

- Purpose: create event
- Auth: Protected (`event:create`)
- Body fields:
  - title(string, required)
  - description(string, optional)
  - budget(number, optional)
  - service_windows(array<object>, optional)
- Response 201: created `Event`
- Status codes: 201, 401, 403, 422, 500

### GET /events/{id}

- Purpose: fetch event details
- Auth: Protected (`event:read` + object checks)
- Response 200: `Event`
- Status codes: 200, 401, 403, 404, 500

### PATCH /events/{id}

- Purpose: update editable fields on draft event
- Auth: Protected (`event:update` + creator/object checks)
- Body: title/description/budget/service windows updates
- Response 200: updated event
- Status codes: 200, 401, 403, 404, 409, 422, 500

### PATCH /events/{id}/submit

- Purpose: submit event for approval
- Auth: Protected (`event:submit`)
- Body: optional note/context
- Response 200: updated state
- Status codes: 200, 401, 403, 404, 409, 500

### PATCH /events/{id}/service

- Purpose: transition event to in-service
- Auth: Protected (`event:service`)
- Response 200: updated event
- Status codes: 200, 401, 403, 404, 409, 500

### PATCH /events/{id}/close

- Purpose: close event lifecycle
- Auth: Protected (`event:close`)
- Response 200: updated event
- Status codes: 200, 401, 403, 404, 409, 500

### GET /events/{id}/materials

- Purpose: event materials overview
- Auth: Protected (`event:read`)
- Response 200: material entries
- Status codes: 200, 401, 403, 404, 500

### POST /events/{id}/materials

- Purpose: add material requirement
- Auth: Protected (`event:update` or planner flow)
- Body: material_id/name, quantity, unit, notes
- Response 201/200: created material row
- Status codes: 200, 201, 401, 403, 404, 422, 500

### DELETE /events/{id}/materials/{materialId}

- Purpose: remove event material requirement
- Auth: Protected (`event:update`)
- Response 200: deletion confirmation
- Status codes: 200, 401, 403, 404, 500

### GET /events/{id}/resource-requests

- Purpose: list resource requests for event
- Auth: Protected (`resource:request`/`resource:manage` depending role)
- Response 200: request list
- Status codes: 200, 401, 403, 404, 500

### POST /events/{id}/resource-requests

- Purpose: create resource request
- Auth: Protected (`resource:request`)
- Body: resource/category refs, quantity, time window, special flags
- Response 201/200: created request
- Status codes: 200, 201, 401, 403, 404, 422, 500

### DELETE /events/{id}/resource-requests/{requestId}

- Purpose: cancel/remove resource request
- Auth: Protected (`resource:request` + ownership checks)
- Response 200
- Status codes: 200, 401, 403, 404, 500

## 3.5 Approvals

### GET /approvals

- Purpose: list approval queue
- Auth: Protected (`event:approve` or module-specific approver perms)
- Query: pagination, status filters
- Response 200: approval list
- Status codes: 200, 401, 403, 422, 500

### POST /approvals/{id}/approve

- Purpose: approve pending item
- Auth: Protected (`event:approve`, `recipe:approve`, etc.)
- Body: optional comment
- Response 200: approval record
- Status codes: 200, 401, 403, 404, 409, 422, 500

### POST /approvals/{id}/reject

- Purpose: reject pending item
- Auth: Protected (approver permissions)
- Body: reason(required)
- Response 200: approval record
- Status codes: 200, 401, 403, 404, 409, 422, 500

## 3.6 Reservations

### GET /reservations

- Purpose: list reservations
- Auth: Protected (`reservation:request`/`reservation:approve`/`reservation:operate`)
- Query: pagination + filters
- Response 200: paginated `Reservation[]`
- Status codes: 200, 401, 403, 422, 500

### POST /reservations

- Purpose: create reservation request
- Auth: Protected (`reservation:request`)
- Body fields:
  - event_id(uuid, required)
  - resource_id(uuid, required)
  - start_time(date-time, required)
  - end_time(date-time, required)
  - notes(string, optional)
- Response 201/200: `Reservation`
- Status codes: 200, 201, 401, 403, 404, 422, 500

### GET /reservations/{id}

- Purpose: reservation detail
- Auth: Protected with object scope checks
- Response 200: `Reservation`
- Status codes: 200, 401, 403, 404, 500

### POST /reservations/{id}/approve

### POST /reservations/{id}/release

### POST /reservations/{id}/occupy

### POST /reservations/{id}/return

### POST /reservations/{id}/overtime-approve

### POST /reservations/{id}/cancel

### POST /reservations/{id}/reschedule

### POST /reservations/{id}/renew

- Purpose: reservation state transitions
- Auth: Protected (`reservation:approve`, `reservation:operate`, or `reservation:overtime_approve` as applicable)
- Body: transition-specific fields (reason, new time window, renewal duration, etc.)
- Response 200: updated `Reservation`
- Status codes: 200, 401, 403, 404, 409, 422, 500
- Example request (`reschedule`):

```json
{
  "start_time": "2026-05-05T10:00:00Z",
  "end_time": "2026-05-05T12:00:00Z",
  "reason": "Venue conflict"
}
```

## 3.7 Recipes

### GET /recipes

- Purpose: list recipes
- Auth: Protected (`recipe:create` or `recipe:review` or `recipe:approve`)
- Response 200: recipe list
- Status codes: 200, 401, 403, 500

### POST /recipes

- Purpose: create recipe root entity
- Auth: Protected (`recipe:create`)
- Body: title/category metadata
- Response 201/200: created recipe
- Status codes: 200, 201, 401, 403, 422, 500

### GET /recipes/{id}

- Purpose: recipe detail
- Auth: Protected (recipe permissions)
- Response 200: recipe with versions
- Status codes: 200, 401, 403, 404, 500

### GET /recipes/{id}/versions

- Purpose: list recipe versions
- Auth: Protected
- Response 200: `RecipeVersion[]`
- Status codes: 200, 401, 403, 404, 500

### POST /recipes/{id}/versions

- Purpose: create new recipe version
- Auth: Protected (`recipe:create`)
- Body fields:
  - title(string, required)
  - ingredients(array, required)
  - steps(array<string>, required)
  - yield_amount(number, optional)
  - yield_unit(string, optional)
  - allergens(array<string>, optional)
- Response 201/200: created `RecipeVersion`
- Status codes: 200, 201, 401, 403, 404, 422, 500

### POST /recipes/{recipeId}/versions/{versionId}/submit

### POST /recipes/{recipeId}/versions/{versionId}/approve

### POST /recipes/{recipeId}/versions/{versionId}/reject

- Purpose: recipe approval workflow transitions
- Auth: Protected (`recipe:review`/`recipe:approve`)
- Body: comment/reason where relevant
- Response 200: updated version state
- Status codes: 200, 401, 403, 404, 409, 422, 500

## 3.8 Inventory

### GET /inventory/snapshots

### GET /inventory/snapshots/{id}

- Purpose: list and fetch inventory snapshots
- Auth: Protected (`inventory:read`)
- Response 200: `InventorySnapshot` or list
- Status codes: 200, 401, 403, 404, 500

### GET /inventory/gaps

- Purpose: list unresolved/resolved inventory gaps
- Auth: Protected (`inventory:read`)
- Response 200: gap list
- Status codes: 200, 401, 403, 500

### POST /inventory/gaps/{id}/resolve

- Purpose: resolve identified gap/anomaly
- Auth: Protected (`inventory:resolve_gap`)
- Body: resolution note, resolution metadata
- Response 200: updated gap record
- Status codes: 200, 401, 403, 404, 422, 500

### GET /inventory/export

- Purpose: export inventory report
- Auth: Protected (`inventory:export`)
- Response 200: file stream or export metadata
- Status codes: 200, 401, 403, 500

## 3.9 Entitlements

### GET /entitlements

- Purpose: list entitlements
- Auth: Protected (`entitlement:issue_*` admin scope or scoped self-access)
- Query: holder/event filters, pagination
- Response 200: `Entitlement[]`
- Status codes: 200, 401, 403, 500

### POST /entitlements

- Purpose: issue entitlement manually/automatically
- Auth: Protected (`entitlement:issue_manual` or `entitlement:issue_auto`)
- Body fields:
  - type_id(uuid, required)
  - holder_id(uuid, required)
  - event_id(uuid, optional)
  - idempotency_key(string, optional)
- Response 201/200: created entitlement
- Status codes: 200, 201, 401, 403, 422, 500

### POST /entitlements/bulk-import

- Purpose: import entitlements in bulk
- Auth: Protected (`entitlement:bulk_import`)
- Body: upload/batch payload (CSV or structured records)
- Response 200/202: import summary
- Status codes: 200, 202, 401, 403, 422, 500

### POST /entitlements/{id}/redeem

- Purpose: redeem entitlement (idempotent)
- Auth: Protected (`entitlement:redeem`)
- Headers: optional `Idempotency-Key`
- Body: redemption context (event/check-in refs)
- Response 200: redemption result
- Status codes: 200, 401, 403, 404, 409, 422, 500
- Example response:

```json
{ "data": { "id": "uuid", "status": "redeemed", "idempotent": true } }
```

### GET /entitlements/types

- Purpose: list entitlement types
- Auth: Protected (admin/read roles depending config)
- Response 200: type list
- Status codes: 200, 401, 403, 500

## 3.10 Attachments

### POST /attachments

- Purpose: upload one or multiple files (multipart)
- Auth: Protected (`attachment:upload` + parent object access check)
- Headers: `Content-Type: multipart/form-data`
- Query: `event_id` or `recipe_version_id`
- Request body: one or more file parts
- Response 200: per-file success/error results
- Status codes: 200, 400, 401, 403, 413, 422, 500
- Example response:

```json
{
  "data": [
    {
      "filename": "quote.pdf",
      "status": "success",
      "attachment": { "id": "uuid" }
    }
  ]
}
```

### GET /attachments

- Purpose: list attachments by parent
- Auth: Protected (`attachment:read` + parent access)
- Query: `event_id` or `recipe_version_id`
- Response 200: `Attachment[]`
- Status codes: 200, 401, 403, 422, 500

### GET /attachments/{id}

- Purpose: attachment metadata
- Auth: Protected (`attachment:read`)
- Response 200: attachment metadata record
- Status codes: 200, 401, 403, 404, 500

### GET /attachments/{id}/download

- Purpose: stream attachment binary
- Auth: Protected (`attachment:read`)
- Response 200: file stream (`Content-Type` from stored mime)
- Status codes: 200, 401, 403, 404, 500

## 3.11 Catalog/Resources

### GET /catalog/tree

- Purpose: fetch hierarchical catalog
- Auth: Protected (`event:read`/resource permissions)
- Response 200: categories/resources tree
- Status codes: 200, 401, 403, 500

### GET /catalog/categories

### POST /catalog/categories

- Purpose: list/create catalog categories
- Auth: GET protected read, POST protected (`resource:manage`)
- Body (POST): name, parent_id, attributes
- Status codes: 200, 201, 401, 403, 422, 500

### GET /catalog/resources

### POST /catalog/resources

### GET /catalog/resources/{id}

### PATCH /catalog/resources/{id}

- Purpose: list/create/read/update resources
- Auth: Protected (`resource:manage` for write, scoped reads for others)
- Body (create/update): name, category_id, attributes, quotas/status
- Status codes: 200, 201, 401, 403, 404, 422, 500

### POST /catalog/resources/{id}/publish

### POST /catalog/resources/{id}/unpublish

- Purpose: resource visibility transitions
- Auth: Protected (`resource:manage`)
- Response 200: updated resource state
- Status codes: 200, 401, 403, 404, 409, 500

### GET /catalog/templates

- Purpose: list resource templates
- Auth: Protected
- Response 200: template list
- Status codes: 200, 401, 403, 500

## 3.12 Check-In

### POST /check-in

- Purpose: perform attendee/entitlement check-in
- Auth: Protected (`entitlement:redeem` and scope checks)
- Body: entitlementId/eventId/operator metadata
- Response 200: check-in result and redemption status
- Status codes: 200, 401, 403, 404, 409, 422, 500

### GET /check-in/verify/{entitlementId}

- Purpose: verify entitlement eligibility before check-in
- Auth: Protected
- Response 200: verification state
- Status codes: 200, 401, 403, 404, 500

## 3.13 Reports

### GET /reports/events

### GET /reports/inventory

### GET /reports/entitlements

### GET /reports/reservations

- Purpose: export/report datasets by domain
- Auth: Protected (`reports:export`)
- Query: date range, filters, format
- Response 200: report payload or export reference
- Status codes: 200, 401, 403, 422, 500

## 3.14 Audit

### GET /audit

### GET /admin/audit-logs

- Purpose: read immutable audit logs
- Auth: Protected (`audit:read`)
- Query: subject type/id, actor, date range, pagination
- Response 200: audit record list
- Status codes: 200, 401, 403, 422, 500

## 3.15 Cache Administration

### POST /admin/cache/invalidate

- Purpose: invalidate cache keys/patterns
- Auth: Protected (`ops:cache_admin`)
- Body: key or pattern (required)
- Response 200: invalidation summary
- Status codes: 200, 401, 403, 422, 500

### GET /admin/cache/stats

- Purpose: inspect cache health and key metrics
- Auth: Protected (`ops:cache_admin`)
- Response 200: cache stats
- Status codes: 200, 401, 403, 500

### GET /admin/cache

### GET /admin/cache/{key}

- Purpose: list cache metadata / inspect specific key
- Auth: Protected (`ops:cache_admin`)
- Response 200
- Status codes: 200, 401, 403, 404, 500

## 3.16 Backup and DR Operations

### GET /admin/backups/runs

### GET /admin/backup

- Purpose: list backup runs
- Auth: Protected (`ops:backup_admin`)
- Response 200: backup run entries
- Status codes: 200, 401, 403, 500

### POST /admin/backups/restore-test

### POST /admin/backup/drill

- Purpose: record restore drill/test run
- Auth: Protected (`ops:backup_admin`)
- Body fields:
  - backup_file(string, required)
  - outcome(enum success, failure, required)
  - duration_seconds(number, optional)
  - notes(string, optional)
- Response 201/200: created drill record
- Status codes: 200, 201, 401, 403, 422, 500

### GET /admin/backups/drills

### GET /admin/backup/drill/{id}

- Purpose: list/get drill history
- Auth: Protected (`ops:backup_admin`)
- Response 200: drill record(s)
- Status codes: 200, 401, 403, 404, 500

## 3.17 Data Collection Ops

### GET /data-collection/health

- Purpose: data collection subsystem health
- Auth: Protected (`ops:data_collection_admin`)
- Response 200: subsystem health object
- Status codes: 200, 401, 403, 500

### POST /data-collection/jobs/{id}/requeue

- Purpose: requeue failed ingestion/collection job
- Auth: Protected (`ops:data_collection_admin`)
- Params: id(uuid)
- Response 200: updated job
- Status codes: 200, 401, 403, 404, 422, 500

### GET /admin/data-collection/jobs

- Purpose: paginated jobs list
- Auth: Protected (`ops:data_collection_admin`)
- Query: page, pageSize, status
- Response 200: paginated job list
- Status codes: 200, 401, 403, 422, 500

## 4) Endpoint-to-Permission Summary

- Public: `/health`, `/auth/register`, `/auth/login`, `/auth/refresh`
- Authenticated self-service: `/auth/me`, `/auth/logout`, `/auth/change-password`
- Admin security/identity: `/users*`, `/admin/users*`, role and manager-scope assignment
- Core operations: `/events*`, `/approvals*`, `/reservations*`, `/recipes*`, `/inventory*`
- Entitlement flow: `/entitlements*`, `/check-in*`
- Assets and catalog: `/attachments*`, `/catalog*`
- Reporting and audit: `/reports*`, `/audit*`
- Platform ops: `/admin/cache*`, `/admin/backup*`, `/admin/backups*`, `/data-collection*`, `/admin/data-collection/jobs`

## 5) Response Status Code Meanings

- 200 OK: successful read/update action
- 201 Created: resource created
- 202 Accepted: async import/processing accepted
- 400 Bad Request: malformed request
- 401 Unauthorized: missing/invalid/expired credentials
- 403 Forbidden: authenticated but insufficient permission/scope
- 404 Not Found: resource/path not found
- 409 Conflict: business conflict or invalid state transition
- 413 Payload Too Large: upload exceeds configured limit
- 422 Unprocessable Entity: schema/validation errors
- 500 Internal Server Error: unhandled server error

## 6) Examples of Standard Error Responses

### 401 Unauthorized

```json
{
  "code": "UNAUTHORIZED",
  "message": "Missing or invalid authorization token",
  "details": null,
  "requestId": "req-abc"
}
```

### 403 Forbidden

```json
{
  "code": "FORBIDDEN",
  "message": "Insufficient permissions",
  "details": null,
  "requestId": "req-def"
}
```

### 422 Validation Error

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Validation failed",
  "details": { "errors": [{ "field": "title", "message": "Required" }] },
  "requestId": "req-ghi"
}
```

### 500 Internal Error

```json
{
  "code": "INTERNAL_ERROR",
  "message": "An unexpected error occurred",
  "details": null,
  "requestId": "req-jkl"
}
```
