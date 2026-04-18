# Questions Traceability Matrix

Maps each question (Q1-Q30) from questions.md to the implementation files that address it.

| ID | Question Topic | Implementation Files |
|---|---|---|
| Q1 | User Registration | `backend/src/auth/routes.js`, `frontend/src/routes/register/` |
| Q2 | Token Lifecycle | `backend/src/auth/routes.js` (refresh endpoint), `frontend/src/lib/api/client.js` (auto-refresh interceptor) |
| Q3 | Role Definitions | `backend/src/db/seeds/001_roles_permissions.js` |
| Q4 | Event State Machine | `backend/src/modules/events/service.js` |
| Q5 | Budget Override | `backend/src/modules/events/service.js`, `backend/src/modules/approvals/` |
| Q6 | Service Windows | `backend/src/modules/events/repository.js` |
| Q7 | Special Resources | `backend/src/modules/events/routes.js` (resource-requests sub-routes) |
| Q8 | Timeline Process Logs | `backend/src/shared/audit.js`, `frontend/src/routes/` (audit timeline component) |
| Q9 | Entitlements | `backend/src/modules/entitlements/` |
| Q10 | Recipe Versioning | `backend/src/modules/recipes/` |
| Q11 | Inventory Snapshots | `backend/src/modules/inventory/` |
| Q12 | Overtime | `backend/src/modules/reservations/service.js` |
| Q13 | Over-Quota | `backend/src/modules/events/routes.js` (quota check middleware) |
| Q14 | Attachments | `backend/src/modules/attachments/` |
| Q15 | Encryption | `backend/src/shared/encryption.js` |
| Q16 | Anti-Crawling | `backend/src/modules/data-collection/` |
| Q17 | Resource Catalog Tree | `backend/src/modules/resources/` |
| Q18 | Bulk Import | `backend/src/modules/entitlements/service.js` (bulk import handler) |
| Q19 | Idempotent Redemption | `backend/src/modules/entitlements/service.js` (idempotency key logic) |
| Q20 | Materials List | `backend/src/modules/events/` (materials sub-module) |
| Q21 | Tablet Check-In | `frontend/src/routes/check-in/` |
| Q22 | Caching | `backend/src/plugins/cache.js` |
| Q23 | Image Resizing | `backend/src/plugins/image-processor.js` |
| Q24 | Optional SSR | `frontend/src/routes/+layout.js`, config flag `ENABLE_SSR` |
| Q25 | Circuit Breaking | `backend/src/plugins/circuit-breaker.js` |
| Q26 | Backups | `backend/src/modules/backup/` |
| Q27 | Approval Routing | `backend/src/modules/approvals/service.js` |
| Q28 | Single Organization | `docs/security-evidence.md` (architecture decision record) |
| Q29 | Idempotency Key Window | `backend/src/modules/entitlements/service.js` (key expiry and dedup window) |
| Q30 | Reporting | `backend/src/modules/reports/` |
