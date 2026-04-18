# Cache Invalidation Matrix

All cache keys are managed through `backend/src/plugins/cache.js`. Invalidation is triggered automatically by domain events or manually via the admin cache purge endpoint.

| Cache Key | TTL | Invalidation Triggers | Implementation |
|---|---|---|---|
| catalog:tree | 24h | Resource publish/unpublish, resource template publish | `backend/src/plugins/cache.js` |
| recipes:approved | 1h | Recipe approve, recipe reject, recipe publish | `backend/src/plugins/cache.js` |
| inventory:snapshot:today | 30min | Scheduled snapshot job execution, manual gap resolution | `backend/src/plugins/cache.js` |
| entitlement:types | 1h | Entitlement type create, update, or disable | `backend/src/plugins/cache.js` |
| events:list | 5min | Event create, event update, event state change, event approval | `backend/src/plugins/cache.js` |

## Invalidation Strategy

### Automatic Invalidation

Cache entries are invalidated automatically when the corresponding domain event fires. The invalidation is performed synchronously as part of the database transaction to ensure consistency. The sequence is:

1. Domain operation executes (e.g., resource publish).
2. Database transaction commits.
3. Cache key is deleted (not updated -- next read will repopulate).
4. Audit log entry is created with action `cache:invalidated`.

### Manual Invalidation

Administrators with the `ops:cache_admin` permission can purge cache keys via:

- **Single key purge**: `DELETE /api/admin/cache/:key`
- **Pattern purge**: `DELETE /api/admin/cache?pattern=catalog:*`
- **Full purge**: `DELETE /api/admin/cache` (no parameters)

Manual purges are recorded in the audit log with action `cache:purged`.

### Cache Miss Behavior

On a cache miss, the system fetches fresh data from the database, populates the cache with the configured TTL, and returns the result. There is no cache stampede protection beyond the short TTLs -- the system relies on the database being the authoritative source.

### Stale Read Window

Because invalidation happens after the transaction commits, there is a negligible window (sub-millisecond) where a concurrent read could serve stale data. This is acceptable for the system's consistency requirements. The short TTLs provide an upper bound on staleness even if an invalidation trigger is missed.
