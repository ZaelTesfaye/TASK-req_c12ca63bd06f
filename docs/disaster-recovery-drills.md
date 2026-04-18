# Disaster Recovery Drills

## Backup Schedule

- **Frequency**: Nightly at 1:00 AM (server local time), executed by the scheduler (`backend/src/plugins/scheduler.js`).
- **Retention**: 30 days. Backups older than 30 days are automatically purged after a successful nightly backup.
- **Storage**: Backups are stored in the configured backup directory (set via `BACKUP_DIR` environment variable).
- **Format**: Full database dump in SQL format, compressed with gzip.

## Standard Operating Procedure: Quarterly Restore Test

This SOP is executed quarterly to verify that backups can be successfully restored and that data integrity is maintained.

### Prerequisites

- The operator must have the `ops:backup_admin` permission (admin role).
- A dedicated test database instance must be available (not the production database).
- The most recent backup file must be accessible.

### How to Initiate

#### Via Admin Panel

1. Navigate to **Admin > Backup & Recovery > Disaster Recovery Drill**.
2. Select the backup file to restore (defaults to the most recent).
3. Click **Start Drill**.
4. The panel displays real-time progress and results.

#### Via API

```
POST /api/admin/backup/drill
Authorization: Bearer <admin-jwt>
Content-Type: application/json

{
  "backup_id": "<optional - defaults to latest>",
  "target_db": "<optional - defaults to configured test database>"
}
```

Response:

```json
{
  "drill_id": "uuid",
  "status": "running",
  "started_at": "2026-04-15T01:00:00Z"
}
```

Poll for completion:

```
GET /api/admin/backup/drill/:drill_id
```

### What Is Verified

The drill performs the following checks after restoring the backup to the test database:

1. **Table counts**: Every table in the restored database is compared against the row counts recorded at backup time. Counts must match exactly.

2. **Sample records**: A configurable number of sample records (default: 10 per table) are selected from key tables and compared field-by-field against the source. Fields checked include primary keys, foreign keys, timestamps, and critical business data.

3. **Timestamps**: The `created_at` and `updated_at` timestamps of the most recent record in each table are verified to fall within the expected backup window.

4. **Schema integrity**: All tables, columns, indexes, and constraints in the restored database are compared against the expected schema. Any drift is flagged.

5. **Referential integrity**: Foreign key constraints are validated to ensure no orphaned records exist.

### Evidence and Record Keeping

All drill results are persisted in the `drill_runs` table:

| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| backup_id | UUID | Foreign key to the backup record used |
| initiated_by | UUID | User ID of the admin who started the drill |
| started_at | Timestamp | When the drill began |
| completed_at | Timestamp | When the drill finished (null if still running or failed) |
| status | Enum | `running`, `passed`, `failed` |
| verification_json | JSONB | Full verification results including table counts, sample record comparisons, timestamp checks, and any discrepancies |
| error | Text | Error message if the drill failed (null on success) |

The `verification_json` field contains structured data:

```json
{
  "table_counts": {
    "events": { "expected": 1523, "actual": 1523, "match": true },
    "reservations": { "expected": 4201, "actual": 4201, "match": true }
  },
  "sample_records": {
    "events": { "checked": 10, "passed": 10, "failures": [] },
    "reservations": { "checked": 10, "passed": 10, "failures": [] }
  },
  "timestamps": {
    "events": { "latest": "2026-04-14T23:45:00Z", "within_window": true },
    "reservations": { "latest": "2026-04-14T22:30:00Z", "within_window": true }
  },
  "schema_integrity": { "passed": true, "drift": [] },
  "referential_integrity": { "passed": true, "orphans": [] }
}
```

### Audit Trail

All drill-related events are recorded in the audit log:

- `backup_drill:started` -- when a drill is initiated.
- `backup_drill:completed` -- when a drill passes all checks.
- `backup_drill:failed` -- when a drill fails any check, including the specific failure details.

### Failure Response

If a drill fails:

1. The `drill_runs` record is updated with status `failed` and the `error` field is populated.
2. An audit log entry is created with the failure details.
3. The admin panel displays the failure with actionable detail from `verification_json`.
4. The operations team should investigate the discrepancy, resolve the root cause, and re-run the drill before the next quarterly deadline.
