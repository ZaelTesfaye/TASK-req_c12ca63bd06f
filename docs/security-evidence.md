# Security Evidence

This document catalogs the security controls implemented in the Hospitality Operations Management System. Each section identifies the control, its implementation location, and its behavior.

---

## 1. Authentication Entry Points

| Endpoint | Method | Purpose | Auth Required |
|---|---|---|---|
| `/auth/register` | POST | Create a new user account | No |
| `/auth/login` | POST | Authenticate with username/password, receive tokens | No |
| `/auth/refresh` | POST | Rotate refresh token, receive new access token | No (token-based) |
| `/auth/logout` | POST | Revoke all refresh tokens for the user | Yes |
| `/auth/me` | GET | Return authenticated user profile | Yes |

**Implementation:** `backend/src/auth/routes.js`

### Password Storage
- Algorithm: **argon2id** (via the `argon2` library)
- Passwords are never stored in plaintext. Only the argon2id hash is persisted in `users.password_hash`.
- Verification uses constant-time comparison through the argon2 library.

### Input Validation
- All auth endpoints validate request bodies with Zod schemas before processing.
- Username: 3-100 characters. Password: 8-128 characters.
- Invalid payloads receive a 422 response with structured error details.

---

## 2. JWT Token Lifecycle

| Token Type | Lifetime | Secret Config Key | Storage |
|---|---|---|---|
| Access token | 45 minutes (configurable via `JWT_ACCESS_TTL_MINUTES`) | `JWT_ACCESS_SECRET` | Client-side only (not stored server-side) |
| Refresh token | 10 days (configurable via `JWT_REFRESH_TTL_DAYS`) | `JWT_REFRESH_SECRET` | SHA-256 hash stored in `refresh_tokens` table |

### Token Generation
- Access tokens are signed with HMAC using `jsonwebtoken`. Payload includes `userId`, `username`, `roles`, and `permissions`.
- Refresh tokens are UUIDv4 values. The server stores only the SHA-256 hash, never the raw token.

### Token Rotation
- On refresh (`POST /auth/refresh`), the old refresh token is revoked (`revoked_at` set) and a new one is issued.
- The new token's `rotated_from_id` points to the old token for audit purposes.
- Reuse of a revoked token returns 401.

### Token Revocation
- Logout (`POST /auth/logout`) revokes all active refresh tokens for the user.
- Expired tokens are rejected by the `expires_at` check in the database query.

**Implementation:** `backend/src/auth/routes.js` (functions `generateTokens`, `generateTokensWithRotation`, `hashRefreshToken`)

---

## 3. Route-Level Authentication

All protected routes use the `authenticate` middleware as a Fastify `preHandler` hook.

**Behavior:**
1. Extracts the Bearer token from the `Authorization` header.
2. Verifies the token signature and expiration using `jsonwebtoken.verify()`.
3. On success: attaches `{ userId, username, roles, permissions }` to `request.user`.
4. On failure: returns 401 with a structured error (`UNAUTHORIZED`).
5. Distinguishes expired tokens (`TokenExpiredError`) from invalid tokens in the error message.

**Implementation:** `backend/src/middleware/authenticate.js`

**Coverage:** Applied to all module routes except the public auth endpoints (`/auth/login`, `/auth/register`, `/auth/refresh`).

---

## 4. Permission-Level Authorization

Protected routes that require specific capabilities use the `authorize` middleware factory.

**Behavior:**
1. Accepts one or more permission strings (e.g., `authorize('events:create')`, `authorize('admin:roles')`).
2. Checks that `request.user.permissions` includes ALL required permissions.
3. On failure: returns 403 with `FORBIDDEN` code and details listing required vs. actual permissions.

**Implementation:** `backend/src/middleware/authorize.js`

**Example usage in routes:**
```javascript
app.post('/events', {
  preHandler: [authenticate, authorize('events:create')]
}, handler);
```

### Permission Codes by Module

| Module | Permission Codes |
|---|---|
| Events | `events:create`, `events:read`, `events:update`, `events:delete`, `events:transition` |
| Approvals | `approvals:read`, `approvals:decide` |
| Reservations | `reservations:create`, `reservations:read`, `reservations:update`, `reservations:transition` |
| Recipes | `recipes:create`, `recipes:read`, `recipes:update`, `recipes:review` |
| Inventory | `inventory:read`, `inventory:snapshot`, `inventory:update` |
| Entitlements | `entitlements:issue`, `entitlements:redeem`, `entitlements:read`, `entitlements:bulk` |
| Attachments | `attachments:upload`, `attachments:read`, `attachments:delete` |
| Check-in | `checkin:read`, `checkin:update` |
| Reports | `reports:read`, `reports:export` |
| Catalog | `catalog:read`, `catalog:update` |
| Admin | `admin:roles`, `admin:manager_scope`, `admin:backup`, `admin:cache` |

---

## 5. Object-Level Authorization

Beyond route-level permissions, certain operations enforce ownership and scope constraints at the service layer.

### Event Creator-Only Edit
- Only the user who created an event (or an administrator) can edit it.
- Enforced in `modules/events/service.js` by comparing `request.user.userId` against the event's `created_by` field.

### Manager Scope Enforcement
- Resource managers can only manage resources within their assigned scope.
- Scope is checked in the service layer before allowing resource mutations.

### Approval Authority
- Approvers can only decide on items routed to their role.
- Self-approval is prevented: the requester cannot approve their own submission.

**Implementation:** `modules/events/service.js`, `modules/approvals/service.js`, `modules/reservations/service.js`

---

## 6. Admin Endpoint Protection

Administrative endpoints require explicit admin permissions:

| Endpoint Group | Required Permission |
|---|---|
| `/admin/*` (role management) | `admin:roles` |
| `/admin/backups/*` | `admin:backup` |
| `/admin/cache/*` | `admin:cache` |
| Manager scope assignment | `admin:manager_scope` |

**Implementation:** `modules/roles/routes.js`, `modules/backup/routes.js`, `modules/admin-cache-routes.js`

---

## 7. Sensitive Data Protection

### Encryption at Rest

- **Algorithm:** AES-256-GCM (authenticated encryption)
- **IV:** 96-bit random nonce per encryption operation
- **Auth tag:** 128-bit (provides integrity verification)
- **Key:** 256-bit key derived from `ENCRYPTION_KEY_HEX` (64 hex characters, validated at startup)
- **Storage format:** `iv:authTag:ciphertext` (all hex-encoded)

**Implementation:** `backend/src/shared/encryption.js`

### Field Masking

Sensitive fields are masked for display in API responses and logs:

| Field Type | Masking Strategy | Example |
|---|---|---|
| `employee_id` | Show last 4 characters | `****1234` |
| `phone` | Show last 2 digits | `********90` |
| `email` | Mask local part, keep domain | `j****n@example.com` |
| Default | Show last 4 characters | `****5678` |

**Implementation:** `backend/src/shared/encryption.js` (`maskField()` function)

### Log Redaction

- Structured logging via `backend/src/logging/index.js` ensures sensitive values are not written to log output.
- Password fields are never logged. Token values are never logged.
- Audit trail entries store before/after snapshots with sensitive fields masked.

### Key Validation

- `ENCRYPTION_KEY_HEX` is validated at application startup with a strict regex: `/^[0-9a-fA-F]{64}$/`.
- Missing or malformed keys cause the application to fail fast with a clear error message.
- In production (`NODE_ENV=production`), the key is required with no fallback.

---

## 8. Single-Tenant Boundary

This system is designed for **single-tenant, on-premises deployment**.

- All data belongs to one organization. There is no multi-org data isolation layer.
- There are no tenant ID columns or cross-tenant query boundaries.
- RBAC controls access within the single tenant based on user roles and permissions.
- The database connection string points to a single PostgreSQL database (`hospitality_ops`).

This is by design: the system serves a single corporate entity's catering and venue operations.

---

## 9. Input Validation

- **Backend:** All request bodies are validated using Zod schemas before reaching service logic. Invalid payloads return 422 with structured error details.
- **Frontend:** Form inputs are validated using Zod schemas in `frontend/src/lib/schemas/` before submission.
- **Middleware:** `backend/src/middleware/validate.js` provides a reusable Fastify preHandler for schema validation.

---

## 10. CORS and Origin Control

- The backend is configured to accept requests from `FRONTEND_URL` (default `http://localhost:5173`).
- In production, `FRONTEND_URL` must be set to the actual frontend origin.
- No wildcard (`*`) CORS origins are used.

---

## 11. Upload Security

| Control | Implementation |
|---|---|
| File size limit | `UPLOAD_MAX_MB=25` enforced in upload routes |
| MIME type allowlist | `UPLOAD_ALLOWED_MIME` checked before file storage |
| SHA-256 integrity hash | Computed on upload, stored in database, verifiable on download |
| File storage | Stored on filesystem at `UPLOAD_ROOT`, not in database BLOBs |

**Implementation:** `modules/attachments/service.js`, `modules/attachments/routes.js`

---

## 12. Audit Trail Immutability

- All state changes are recorded in the `audit_trail` table via `shared/audit.js`.
- The audit table has no UPDATE or DELETE API endpoints.
- Audit records include: subject type, subject ID, action, actor user ID, before/after snapshots, timestamp.
- Audit write failures are logged but do not block the primary operation (defense in depth: the error is still thrown to callers who choose to handle it).

**Implementation:** `backend/src/shared/audit.js`, `backend/src/modules/audit/routes.js`

---

## 13. Dependency and Runtime Security

| Concern | Approach |
|---|---|
| Password hashing | argon2id (memory-hard, side-channel resistant) |
| Token signing | HMAC-SHA256 via jsonwebtoken |
| Encryption | Node.js built-in `crypto` module (AES-256-GCM) |
| Image processing | Sharp (native, no arbitrary code execution) |
| Database queries | Knex.js parameterized queries (prevents SQL injection) |
| Request validation | Zod schemas (prevents malformed input) |
| Circuit breaking | opossum (prevents cascade failures) |
