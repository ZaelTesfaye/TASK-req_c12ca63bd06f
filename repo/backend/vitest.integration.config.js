/**
 * Vitest Configuration for Integration Tests
 *
 * Separate config that does NOT mock anything.
 * Only includes tests/integration/**/*.test.js.
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
  },
});
