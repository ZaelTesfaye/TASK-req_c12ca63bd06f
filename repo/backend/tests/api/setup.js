/**
 * api/setup.js — no-mock HTTP test harness (real DB, real buildApp).
 *
 * The legacy mocked-DB helpers lived here. They were removed in favour of a
 * single real-DB harness so every HTTP test the repo ships is a true no-mock
 * integration test. New HTTP test files under `backend/tests/api/` (or the
 * preferred location `backend/tests/integration/`) should use this harness.
 *
 * All existing scenarios have been migrated to the `backend/tests/integration/`
 * suite, which runs against the same harness.
 */

export {
  setupTestDb,
  teardownTestDb,
  getApp,
  loginAs,
  loginFull,
  db,
} from '../integration/setup.js';
