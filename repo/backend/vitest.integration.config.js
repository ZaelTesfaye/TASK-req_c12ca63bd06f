/**
 * Vitest Configuration for Integration Tests
 *
 * Separate config that does NOT mock anything.
 * Only includes test files under tests/integration (see `include` below).
 *
 * These tests require a real PostgreSQL database accessible via DATABASE_URL.
 * They are designed to run inside Docker alongside a postgres container.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.test.js'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Integration tests share one Postgres database — running them in
    // parallel produces unique-constraint / FK / deadlock errors as each
    // suite's setupTestDb() races to seed and teardown. Force a single
    // fork so files execute one at a time.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
    // No explicit pool teardown hook. Vitest's --run mode exits via
    // process.exit after all tests complete; the knex pool's TCP
    // sockets die with the fork. A fork-level setupFiles entry that
    // imports db here was observed to corrupt the test files' own
    // `import { db } from './setup.js'` binding under Vitest's module
    // transformer, surfacing as `(0 , db) is not a function` on every
    // `db('table')` call.
  },
});
