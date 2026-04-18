/**
 * Knex Configuration
 *
 * Uses the centralized config module — never reads process.env directly.
 * Consumed by the knex CLI and by connection.js at runtime.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const knexConfig = {
  client: 'pg',
  connection: config.databaseUrl,

  pool: {
    min: 2,
    max: 10,
  },

  migrations: {
    directory: path.join(__dirname, 'migrations'),
    tableName: 'knex_migrations',
  },

  seeds: {
    directory: path.join(__dirname, 'seeds'),
  },

  // Use pino-compatible debug output in non-production
  ...(config.nodeEnv !== 'production' && {
    debug: false, // set to true to see SQL statements during development
  }),
};

// Knex CLI expects a default export (or named environment exports)
export default knexConfig;
export { knexConfig };
