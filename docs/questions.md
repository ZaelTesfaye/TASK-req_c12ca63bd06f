# questions.md

## 1. User Registration vs. Predefined Accounts

**Question:** The specification mentions users "sign in with a local username and password" but does not clarify whether new accounts can be created through the UI or if only predefined accounts (loaded by admin or seeded in the database) are supported.

**Assumption:** Users can create accounts locally within the app during initial setup or onboarding; credentials are stored securely in PostgreSQL with proper hashing (e.g., bcrypt or Argon2).

**Solution:** Implement a registration screen accessible from the login page (or admin enrollment flow) that validates username uniqueness, enforces password strength, and stores passwordHash in the Users table alongside role and status fields.

---

## 2. Authentication Token Lifecycle and Refresh Strategy

**Question:** The specification does not define token expiration windows, refresh token rotation, or how the Svelte frontend handles token renewal without forcing user re-authentication.

**Assumption:** Access tokens expire after a reasonable session window (e.g., 30 minutes to 1 hour); refresh tokens are longer-lived (e.g., 7–14 days) and are rotated on each use. The frontend detects 401 responses, silently refreshes the token, and retries the original request.

**Solution:** Implement JWT tokens with `exp`, `iat`, and `sub` claims in the Fastify backend; expose a `/auth/refresh` endpoint that validates the refresh token, issues a new access token, and optionally rotates the refresh token. In the Svelte client, add a fetch interceptor that detects 401 and calls refresh before retrying.

---

## 3. Role Definitions and Permission Boundaries

**Question:** The specification describes Event Planners, Resource Managers, Culinary Editors, Inventory Analysts, and Approvers, but does not define whether these are mutually exclusive roles, whether users can hold multiple roles, or what permissions distinguish each role.

**Assumption:** Roles are granular and may be combined (a user can be both an Event Planner and an Approver). Permissions are defined at the action level (e.g., `event:create`, `budget:override`, `recipe:approve`) and are checked by Fastify route guards and frontend route protection.

**Solution:** Define a Roles enum (EventPlanner, ResourceManager, CulinaryEditor, InventoryAnalyst, Approver) and a Permissions table mapping roles to actions. Implement route-level middleware that extracts the user's role from the JWT, checks required permissions, and returns 403 if denied. In the Svelte frontend, gate route visibility and button state based on the logged-in user's role or cached permissions.

---

## 4. Event State Machine Transitions and Validation Rules

**Question:** The specification defines an event state machine (Draft, Submitted, Approved, In Service, Closed) but does not specify which roles trigger transitions or what data validations must pass before each transition.

**Assumption:** Draft → Submitted requires all event fields (dates, headcount, budget, materials) to be complete and present. Submitted → Approved requires an Approver's explicit action (with optional budget override if >10% increase). In Service and Closed transitions are triggered by Resource Managers or system time-based rules.

**Solution:** Implement an Events table with a `state` enum field and a state_updated_at timestamp. Add business logic in the backend that enforces transition rules (e.g., reject Submitted if headcount is missing). Expose a PATCH `/events/{id}/state` endpoint that validates the transition, logs the change to AuditTrail, and updates the event timestamp. In the UI, show state badges and conditionally enable/disable action buttons based on current state and user role.

---

## 5. Budget Override Workflow and Approval Tracking

**Question:** The specification enforces a default budget cap of $25,000 and mentions "Approver explicitly overrides" but does not explain whether the override is a flag on the Event, a separate Approval record, or part of a versioned budget history.

**Assumption:** Overrides are recorded as Approval records linked to the Event, including the approver's ID, timestamp, justification, and new budget cap. Budget change validation (>10% increases) also creates an Approval record that must be reviewed before the change takes effect.

**Solution:** Create an Approvals table with fields: `event_id`, `approver_id`, `approval_type` (BudgetOverride, BudgetChange), `old_amount`, `new_amount`, `status` (Pending, Approved, Rejected), `justification`, `created_at`, `decided_at`. Add business logic that checks the event's current budget against the cap, blocks changes exceeding 10% unless an Approval is Pending, and applies the new budget only after approval. Log each approval decision to AuditTrail.

---

## 6. Service Window Definition and Check-In Workflow

**Question:** The specification mentions "service windows" (plural) as part of event planning but does not clarify whether these are time ranges on the event date, separate booking windows for check-in and check-out, or staffing shift intervals.

**Assumption:** Service windows are time ranges (start_time, end_time) that represent when the catering or venue service is active. Multiple windows can exist for a single event (e.g., breakfast 7–10 AM, lunch 11 AM–2 PM). The tablet check-in screen captures check-ins within the service window.

**Solution:** Add a ServiceWindows table with fields: `event_id`, `label` (e.g., Breakfast, Lunch), `start_at`, `end_at`. In the event creation/edit UI, allow Event Planners to define multiple windows. On the tablet check-in page, show the current window and validate that check-ins fall within that window's time range. Display warnings if a check-in occurs outside the window.

---

## 7. Special Resources Definition and Approval Triggers

**Question:** The specification states that "key-node approvals" apply to "special resources" but does not define what qualifies as special or how Resource Managers or Planners identify them during event planning.

**Assumption:** Special resources are marked in the ResourceCatalog with a `requires_approval` flag (e.g., live band, external catering vendor, specialized equipment). When an Event Planner requests a special resource, an Approval record is automatically created waiting for an Approver's decision.

**Solution:** Add a `requires_approval` boolean field to the ResourceCatalog table. In the event creation UI, when a Planner selects a resource marked as requiring approval, the backend automatically creates a pending Approval record. The Approver sees a dedicated section in their dashboard listing pending resource approvals. Log the approval decision to AuditTrail.

---

## 8. Timeline-Style Process Logs and Event Auditing

**Question:** The specification mentions "timeline-style process logs" and "immutable audit trails" but does not specify what events are logged, who can view them, or what format they are displayed in.

**Assumption:** A ProcessLog (or AuditTrail) table records every state change, approval decision, attachment upload, entitlement redemption, and modification to event data. Each log entry includes user_id, action_type, event_id, before_value, after_value, timestamp, and optional notes. The frontend renders this as a chronological feed with icons and badges.

**Solution:** Add an AuditTrail table with fields: `event_id`, `subject_type` (Event, Approval, Resource, Recipe), `subject_id`, `action` (Created, Updated, Approved, Rejected, StateChanged), `user_id`, `timestamp`, `before_data`, `after_data`, `notes`. Create a GET `/events/{id}/audit-trail` endpoint with pagination. In the UI, render the trail as a timeline with actor, action, timestamp, and diff preview. Restrict view to users with Approver or Admin role.

---

## 9. Entitlements Model: Types, Issuance, and Redemption

**Question:** The specification gives one example of entitlements ("10 staff meals per event role") and mentions automatic, manual, and bulk-import issuance, but does not define the universe of entitlement types or the redemption flow.

**Assumption:** Entitlements are configurable types defined in an EntitlementTypes table (e.g., StaffMeal, VenueHour, EquipmentUnit). On event approval, a rule engine automatically issues entitlements based on event attributes (e.g., headcount, duration, role). Entitlements have a quantity, expiry, and are linked to an event. Redemption decrements quantity and records a RedemptionRecord for audit.

**Solution:** Create EntitlementTypes, Entitlements, and RedemptionRecords tables. Implement an issuance rule engine that fires on event Approval, reading rules like "grant 1 entitlement of type StaffMeal per attendee." Expose POST `/entitlements/{id}/redeem` that checks quantity > 0, expiry date, and idempotency (same user redeeming same entitlement twice should fail). Log all redemptions to AuditTrail.

---

## 10. Recipe Versioning and Review Status Workflow

**Question:** The specification mentions "drafts, version revisions, and a review status workflow" for recipes but does not specify how versions are created, who can review/approve recipes, or how unapproved versions are filtered from material lists.

**Assumption:** Recipes have a version number and a status (Draft, SubmittedForReview, Approved, Rejected). Culinary Editors create drafts; publishing a draft increments the version. Approvers (or designated reviewers) evaluate the published version and mark it Approved. Only Approved versions appear in Event Planner material lists.

**Solution:** Add `version`, `status`, `published_at`, `approved_by`, `approved_at` fields to the Recipes table. When a Culinary Editor saves a draft, increment the version only on explicit "Publish" action. Expose a PUT `/recipes/{id}/publish` endpoint that changes status to SubmittedForReview. Expose a PUT `/recipes/{id}/approve` endpoint (guarded by Approver role) that marks the version Approved. In the material list UI, filter GET `/recipes?status=Approved`.

---

## 11. Inventory Snapshots: Frequency and Gap Detection

**Question:** The specification states "price and inventory snapshots over time" and mentions "missing-day gaps that require correction" but does not specify when snapshots are captured, how frequently, or what data each snapshot contains.

**Assumption:** Daily snapshots of inventory levels and prices for all ingredients and rentals are captured (e.g., at end of business day via a scheduled job). Each InventorySnapshot record includes item_id, quantity_on_hand, unit_price, snapshot_date. The Inventory Analyst UI queries snapshots and flags days with no snapshot or with anomalous (large) quantity or price swings.

**Solution:** Create an InventorySnapshots table with: `item_id`, `snapshot_date`, `quantity`, `unit_price`, `recorded_at`. Implement a scheduled job (using node-cron or similar) that queries current inventory daily at a fixed time and inserts a snapshot. In the Inventory Analyst UI, GET `/inventory/snapshots?item_id=X&date_range=...` and render a chart or table. Detect missing dates (gaps) by comparing consecutive snapshot_date values; flag >20% quantity or price swings.

---

## 12. Overtime Justification and Approval Flow

**Question:** The specification states that "overtime past 30 minutes triggers a mandatory justification and an additional approval step" but does not clarify whether this applies to Resource Manager reservations, event service windows, or staff scheduling.

**Assumption:** This applies to ResourceManager reservations. If a reserved resource is held past its scheduled end_time by >30 minutes, the system requires a justification note and an Approver's approval before the overage is finalized (and potentially billed).

**Solution:** Add `scheduled_end_at`, `actual_end_at`, `justification`, `overtime_approved_by`, `overtime_approved_at` fields to Reservations. Add business logic that checks `actual_end_at - scheduled_end_at > 30 minutes` and sets a flag `overtime_pending_approval`. Expose a PUT `/reservations/{id}/approve-overtime` endpoint (guarded by Approver role). In the Resource Manager UI, show pending overtime items and require justification text before submission.

---

## 13. Over-Quota Policy Exception Workflow

**Question:** The specification mentions "over-quota requests require a policy exception note" but does not define how quota is enforced per resource, who approves exceptions, or whether exceptions extend the quota or merely document it.

**Assumption:** Each ResourceCatalog item has an optional `quota_per_event` field (e.g., max 10 units per event). When a Planner requests more than the quota, the system requires a PolicyExceptionNote and creates a pending Approval. On approval, the quota override is recorded and the event proceeds.

**Solution:** Add `quota_per_event`, `policy_exception_note` fields. In the event creation/edit UI, when a Planner requests a quantity exceeding the quota, show an error with a text field for the policy exception note. On submit, create a PolicyException record and an Approval of type QuotaOverride. Display this pending item in the Approver dashboard and require explicit approval.

---

## 14. Attachment Upload: Formats, Size Limits, and Validation

**Question:** The specification mentions attachments (contracts, menus, photos) with "immediate upload validation and clear status feedback" and "25 MB per-file limit" and "allowlisted formats" but does not list the allowlisted formats or describe the validation logic.

**Assumption:** Allowlisted formats include common document and image types: PDF, DOCX, XLSX, PNG, JPG, JPEG, GIF. Validation includes file size (max 25 MB), MIME type matching, and optionally file-content scanning (magic bytes). Invalid uploads show inline error messages; successful uploads display a checkmark and the filename.

**Solution:** Define an UPLOAD_ALLOWED_FORMATS constant in both backend and frontend. Implement frontend validation (file size, type check) with immediate error feedback. On POST `/attachments`, implement backend validation (re-check size, MIME, compute SHA-256 hash). Store the attachment with its SHA-256 fingerprint in the Attachments table. Return 400 if validation fails with a clear error message.

---

## 15. Sensitive Field Encryption and Masking Strategy

**Question:** The specification states "sensitive fields (e.g., employee IDs) are masked in UI and encrypted at rest using a locally managed key" but does not specify which fields are sensitive, how the encryption key is managed, or what masking scheme is used.

**Assumption:** Sensitive fields include employee_id, phone_number, email, salary, and any PII. These are stored encrypted in PostgreSQL using AES-256 or similar. The encryption key is derived from a server-side secret (not the password) and managed via environment variables or a secure key store. In the UI, sensitive fields are shown masked (e.g., `***-**-1234` for employee ID) except to authorized roles (Approvers, admins).

**Solution:** Use a Node.js encryption library (e.g., `crypto`, `node-forge`) to encrypt/decrypt sensitive fields on write/read. Define a list of sensitive columns. Implement getters/setters in the database layer that automatically encrypt on insert and decrypt on fetch. Add a `maskSensitiveFields()` function in the API response layer that checks user role and applies masking (e.g., last 4 digits only for IDs). Test that only decrypted values work in backend logic and that logs never emit plain-text sensitive values.

---

## 16. Anti-Crawling Subsystem: Scope and Configuration

**Question:** The specification describes an "anti-crawling and stability mechanisms" subsystem with "rotating proxy definitions, dynamic user agents, cookie/session handling, redirect parsing, health checks, and graceful degradation" but does not clarify whether this is an internal data-collection tool or a defense against external crawling.

**Assumption:** This is an internal data-collection subsystem designed to collect or scrape data from internal or controlled external sources (e.g., vendor APIs, partner systems) without internet-facing exposure. It includes configurable proxy rotation, user-agent variation, and circuit breaking for fault tolerance.

**Solution:** Implement a DataCollectionService module that encapsulates HTTP client logic with proxy rotation, user-agent management, and retry/backoff strategies. Configuration (proxy list, vendor endpoints, schedules) is read from environment variables or a config file, not hardcoded. Health checks (e.g., periodic pings to vendor endpoints) log status to the audit trail. If a vendor is unreachable, the system logs a warning and queues the request for manual review rather than failing the entire event.

---

## 17. Resource Catalog Tree Structure and Configuration

**Question:** The specification describes the resource catalog as "a unified tree with configurable resource types and metadata templates that include required fields, validation rules, versioning, publish/unpublish status, tagging, and relationship maintenance to internal training references" but does not specify the tree hierarchy or how templates are applied.

**Assumption:** The resource catalog is a hierarchical table (ResourceCatalog) with parent_id (nullable) allowing categories and subcategories (e.g., Venue > Ballroom > Ballroom A). Each resource has a resource_type (e.g., Venue, Catering, Equipment) and an associated MetadataTemplate (e.g., template for Venue includes fields: capacity, accessibility, parking, AV equipment). Templates enforce required_fields and validation_rules (e.g., capacity must be an integer > 0). Versions and publish status allow staging changes.

**Solution:** Create ResourceCatalog and MetadataTemplate tables. ResourceCatalog includes: id, parent_id, name, resource_type, template_id, published_at, version. MetadataTemplate includes: id, resource_type, required_fields (JSON array), validation_rules (JSON), tags. Implement a GET `/catalog/tree` endpoint that returns the hierarchical structure. When saving a resource, validate against its template's required_fields and rules. Show the tree in the event planning UI for Planners to browse and request.

---

## 18. Bulk Entitlement Import Format and Workflow

**Question:** The specification mentions "offline bulk import" of entitlements but does not specify the file format (CSV, JSON, Excel) or the import workflow (validation, error handling, rollback).

**Assumption:** Bulk imports support CSV format with columns: event_id, user_id, entitlement_type, quantity, expiry_date. The import process validates each row (event exists, user exists, type valid), reports errors per row, and allows rollback if critical errors are found. Successful imports create Entitlement records and log the import to AuditTrail.

**Solution:** Implement a POST `/entitlements/bulk-import` endpoint that accepts a CSV file. Parse the CSV, validate each row, and return a summary (success count, error list, warnings). Allow the user to review errors and retry or confirm. On confirmation, create Entitlement records in a transaction and log the import batch ID to AuditTrail. Store the original CSV in Attachments for audit purposes.

---

## 19. Idempotent Redemption and Rollback Semantics

**Question:** The specification states that entitlement redemption "is idempotent, blocks expired or insufficient quota, supports rollback on failure, and writes fully traceable redemption records" but does not specify how idempotency is enforced or under what conditions rollback occurs.

**Assumption:** Redemptions are idempotent via an idempotency_key (UUID provided by the client). If the same idempotency_key is submitted twice, the second request returns the same result without double-redeeming. Rollback is triggered if the backend detects a constraint violation (expired entitlement, insufficient quantity, event cancelled) and must atomically revert the redemption and return an error to the client.

**Solution:** Add `idempotency_key` field to RedemptionRecords table. In the POST `/entitlements/{id}/redeem` endpoint, check if a RedemptionRecord with the same key exists; if yes, return its result (no double redemption). If not, verify entitlement is not expired and quantity >= redemption amount. If valid, decrement quantity and insert RedemptionRecord in a transaction. If validation fails, return 400 with clear error (ExpiredEntitlement, InsufficientQuantity, etc.).

---

## 20. Materials List Composition and Link to Recipes

**Question:** The specification mentions a "materials list" as part of event planning but does not clarify the relationship between event materials, recipes, and ingredient/rental inventories. It is unclear whether "materials" means selected recipes, individual ingredients, or rental items.

**Assumption:** A Materials list (EventMaterials) is a collection of rows, each referencing either a Recipe (which expands to component ingredients) or a standalone Rental item. Quantities can be multiplied by headcount (e.g., "Chicken Piccata recipe × 50 attendees"). The system tracks both the ingredient and rental sourcing.

**Solution:** Create an EventMaterials table with: event_id, material_type (Recipe or Rental), recipe_id (nullable), rental_id (nullable), display_quantity, unit. Add business logic that, given event headcount and materials, calculates the total ingredient requirements (summing across recipes) and inventory impact. Show the materials list in the event UI with sourcing status (in stock, must order, partially available). Link to inventory snapshots to show price history for cost estimation.

---

## 21. Tablet UI Interactions: Check-In Specifics

**Question:** The specification mentions "optimized for tablet check-in" but does not specify which screens or interactions are tablet-optimized or what check-in workflow the tablet interface supports.

**Assumption:** The tablet interface (landscape orientation, touch-friendly buttons) is used by Resource Managers or venue staff during the event. The check-in screen shows the current event, service window, and a list of attendees (or a search/barcode scanner input). Staff select attendees or scan arrival, which increments occupancy, records check-in timestamps, and validates against headcount.

**Solution:** Implement a dedicated `/check-in` route that renders a tablet-optimized layout (large buttons, minimal text, full-screen focus). Show event details, current service window, and a search/barcode input field. On check-in, POST to `/events/{id}/check-in` with attendee_id, and increment an occupancy counter. Display confirmation (checkmark, name) and log the check-in to AuditTrail. Handle back-office screens (event creation, approvals) for desktop.

---

## 22. Caching Strategy and Cache Invalidation Triggers

**Question:** The specification mentions "local caching and cache invalidation policies" but does not specify what is cached, how long, and what events trigger invalidation.

**Assumption:** Cached data includes ResourceCatalog (tree), RecipeVersions (approved only), InventorySnapshots (today's snapshot), and EntitlementTypes. Cache keys include timestamps or version numbers. Invalidation is triggered by: Approver publishing a recipe, resource catalog being republished, inventory snapshot job completion, or on-demand via admin action.

**Solution:** Implement a CacheProvider (using Redis or in-memory cache) that stores: catalog-tree (TTL 24h, invalidated on publish), recipes-approved (TTL 1h, invalidated on approval), inventory-snapshot-today (TTL 30min, invalidated by snapshot job). In Svelte, fetch from cache-first endpoints (GET `/catalog/tree?cached=true`) and handle cache misses. Provide an admin endpoint to purge specific caches. Log cache hits/misses to structured logs for observability.

---

## 23. Image Resizing and Transcoding Strategy

**Question:** The specification mentions "adaptive on-box image resizing/transcoding" but does not specify which images (attachments, recipe photos) are resized, to what dimensions, and which formats are supported.

**Assumption:** Recipe photos (and possibly attachment previews) are resized on upload to support responsive display (thumbnail: 200px, preview: 600px, full: 1200px max). Supported formats include PNG, JPEG, WebP (with fallback); transcoding may compress JPEG to reduce file size.

**Solution:** On POST `/attachments`, after SHA-256 validation, if the file is an image, use a library (e.g., Sharp) to generate resized variants (thumbnails, preview, full). Store variants with keys: `{hash}-thumb.jpg`, `{hash}-preview.jpg`, `{hash}-full.jpg`. Update the Attachments record with variant metadata. In the UI, serve the appropriately-sized variant based on viewport and context (thumbnail in list, full in modal).

---

## 24. Optional SSR for Critical Screens

**Question:** The specification mentions "optional server-side rendering (SSR) for critical screens" but does not specify which screens or under what conditions SSR is enabled.

**Assumption:** SSR is optionally enabled for the Event Dashboard and Check-In screens in order to provide faster initial page load and support pre-rendering for offline scenarios. Configuration is controlled via environment variable or feature flag.

**Solution:** Implement conditional SSR logic in the Fastify server or use a Svelte adapter (e.g., SvelteKit with adapter-node). Mark critical routes (e.g., `/events`, `/check-in`) with an `ssr: true` flag. Render these routes on the server if SSR is enabled, passing initial data as props. In development/staging, SSR is optional; in production, it can be toggled. Document the performance impact and when to use SSR.

---

## 25. Circuit Breaking for Slow Subsystems

**Question:** The specification mentions "circuit breaking on slow subsystems" but does not specify which subsystems are protected or what failure thresholds trigger circuit breaking.

**Assumption:** Circuit breakers protect calls to slow or flaky subsystems (e.g., inventory service, recipe approval notifications, external vendor APIs). If a subsystem fails or responds slowly (e.g., timeout > 5 seconds, error rate > 10% over 1-minute window), the circuit breaker opens, immediately returning an error to the client without calling the subsystem. After a cooldown (e.g., 30 seconds), the circuit retries.

**Solution:** Use a library (e.g., `opossum`) to wrap external service calls. Configure thresholds (timeout, error count, rolling window). If the circuit is open, return a graceful error (e.g., `ServiceTemporarilyUnavailable`) to the client. Log circuit state changes (open, half-open, closed) to structured logs. Test circuit behavior in integration tests.

---

## 26. Backup Schedule and Disaster Recovery Drills

**Question:** The specification mentions "scheduled backups with quarterly disaster recovery drills validated by restore tests" but does not specify backup frequency, retention, or what restore tests entail.

**Assumption:** Backups are taken daily (e.g., nightly) and retained for 30 days. Quarterly, the ops team restores from a backup to a staging environment, validates data completeness, and documents the process. Restore tests are manual or automated via a script; results are logged and reviewed.

**Solution:** Implement a backup script (using pg_dump or similar) scheduled via cron to run nightly. Store backups on local storage with date-based naming. Maintain a README or runbook documenting the restore procedure. Schedule quarterly restore tests in a non-production environment and document the checklist (data count, key tables, timestamps, sample record verification). Log test results to a BackupTestResults table or external monitoring.

---

## 27. Approval Routing and Multi-Step Sign-Off

**Question:** The specification mentions "key-node approvals for budget changes above 10% and for any special resources" but does not clarify whether approvals cascade (e.g., multiple approvers) or if a single approver is sufficient.

**Assumption:** Most approvals require a single Approver. For budget changes >10% of event budget or >$5,000 (whichever applies), a second approver may be required (escalation). This is configurable, not hardcoded.

**Solution:** Add `requires_second_approval` logic to the Approvals table. If a budget change exceeds the threshold, set requires_second_approval to true and require two Approver signatures before approval is final. Display escalated items differently in the Approver dashboard. Log both approval decisions to AuditTrail independently.

---

## 28. Data Isolation and Multi-Organizational Support

**Question:** The specification does not mention whether the system supports multiple organizations/venues or is single-organization; it also does not clarify data isolation boundaries.

**Assumption:** This is a single on-premises instance for one organization. All events, resources, recipes, and staff belong to a single entity. Data isolation is not required across organizations.

**Solution:** Design the data model with an implicit single organization (no `organization_id` in tables). If future multi-tenancy is desired, this can be added later by adding `organization_id` consistently to core tables. For now, ensure all queries implicitly scope to the single organization.

---

## 29. Redemption Idempotency Key Window and Timeout

**Question:** The specification mentions "idempotent redemption" in the context of entitlements but does not clarify the idempotency key window (how long is a key valid) or what happens if a client does not provide a key.

**Assumption:** Idempotency keys are tracked for 24 hours (after which they can be reused safely). If a client does not provide a key, a server-generated UUID is created and returned to the client (client should cache and reuse it). The client should always provide the key on retry.

**Solution:** Require idempotency_key as an optional header (and fallback to body) on POST `/entitlements/{id}/redeem`. If not provided, generate a UUID. Store every RedemptionRecord with its key and a 24-hour expiry for the key. On repeat submission of the same key, return the cached result (with 200 or idempotent semantics). Clean up expired keys nightly.

---

## 30. Reporting and Export Capabilities

**Question:** The specification does not explicitly mention reporting or export features, though it describes "Inventory Analysts view price and inventory snapshots over time" and mentions "offline report export" (implied from broader context)—but does not specify what reports are available or how they are exported.

**Assumption:** Inventory Analysts can generate snapshots reports (price trends, quantity trends) and export as CSV. Event Planners can export event summaries (attendees, materials, budget). Approvers can export approval logs. Exports are stored locally and include a timestamp and user attribution.

**Solution:** Implement export endpoints (GET `/reports/inventory/export?date_range=...&format=csv`) that aggregate data, format it, and return CSV content. Store exports in a Exports table with file_path, created_by, parameters_hash for audit and reuse. Provide a Reports page in the UI with filters (date range, type) and export buttons.
