/**
 * Centralized Configuration Module
 *
 * SINGLE source of truth for all environment variables.
 * Application code must NEVER access process.env directly — only through this module.
 *
 * In local development, dotenv is loaded to read .env files.
 * In Docker / production, environment variables are injected by the container runtime.
 */

// Load .env only for local development (no-op if the file doesn't exist)
import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read an env var with an optional default.
 * When `required` is true and the value is missing, throws in production.
 */
function env(name, defaultValue = undefined) {
  const value = process.env[name];
  if (value !== undefined && value !== '') return value;
  return defaultValue;
}

/**
 * Read a required env var. Throws if missing in production.
 * In non-production environments, falls back to `devDefault` when provided.
 */
function requiredEnv(name, devDefault = undefined) {
  const value = process.env[name];
  if (value !== undefined && value !== '') return value;

  const nodeEnv = process.env.NODE_ENV || 'development';
  if (nodeEnv === 'production') {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  if (devDefault !== undefined) return devDefault;
  throw new Error(
    `Missing required environment variable: ${name} (no dev default provided)`
  );
}

/** Parse a string to a boolean. */
function parseBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  const lower = String(value).trim().toLowerCase();
  return lower === 'true' || lower === '1' || lower === 'yes';
}

/** Parse a string to an integer. */
function parseInt_(value, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return defaultValue;
  return parsed;
}

/** Parse a comma-separated string into a trimmed, non-empty array. */
function parseCSV(value, defaultValue = []) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Validate ENCRYPTION_KEY_HEX
// ---------------------------------------------------------------------------
const encryptionKeyHex = requiredEnv(
  'ENCRYPTION_KEY_HEX',
  'a'.repeat(64) // dev-only placeholder — 64 hex chars
);

if (!/^[0-9a-fA-F]{64}$/.test(encryptionKeyHex)) {
  throw new Error(
    'ENCRYPTION_KEY_HEX must be exactly 64 hexadecimal characters.'
  );
}

// ---------------------------------------------------------------------------
// Build config
// ---------------------------------------------------------------------------

const config = Object.freeze({
  // General
  nodeEnv: env('NODE_ENV', 'development'),
  port: parseInt_(env('PORT'), 3000),
  isProduction: (env('NODE_ENV', 'development')) === 'production',

  // Database
  databaseUrl: env('DATABASE_URL', 'postgresql://localhost:5432/hospitality_ops'),

  // JWT
  jwt: Object.freeze({
    accessSecret: requiredEnv('JWT_ACCESS_SECRET', 'dev-access-secret-change-me'),
    refreshSecret: requiredEnv('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me'),
    accessTtlMinutes: parseInt_(env('JWT_ACCESS_TTL_MINUTES'), 45),
    refreshTtlDays: parseInt_(env('JWT_REFRESH_TTL_DAYS'), 10),
  }),

  // Encryption
  encryptionKeyHex,

  // Uploads
  upload: Object.freeze({
    root: env('UPLOAD_ROOT', '/app/uploads'),
    maxMb: parseInt_(env('UPLOAD_MAX_MB'), 25),
    allowedMime: parseCSV(env('UPLOAD_ALLOWED_MIME'), [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
    ]),
  }),

  // Redis / Cache
  redisUrl: env('REDIS_URL', 'redis://localhost:6379'),
  cacheMode: env('CACHE_MODE', 'memory'),

  // Feature flags
  enableSsr: parseBool(env('ENABLE_SSR'), false),
  enableTls: parseBool(env('ENABLE_TLS'), false),

  // Backup
  backup: Object.freeze({
    root: env('BACKUP_ROOT', '/app/backups'),
    retentionDays: parseInt_(env('BACKUP_RETENTION_DAYS'), 30),
  }),

  // Scheduled jobs (cron expressions)
  cron: Object.freeze({
    snapshot: env('SNAPSHOT_CRON', '0 23 * * *'),
    keyCleanup: env('KEY_CLEANUP_CRON', '0 2 * * *'),
  }),

  // Circuit breaker (opossum)
  circuitBreaker: Object.freeze({
    timeoutMs: parseInt_(env('CB_TIMEOUT_MS'), 5000),
    errorThresholdPercent: parseInt_(env('CB_ERROR_THRESHOLD_PERCENT'), 10),
    rollingWindowMs: parseInt_(env('CB_ROLLING_WINDOW_MS'), 60000),
    resetTimeoutMs: parseInt_(env('CB_RESET_TIMEOUT_MS'), 30000),
  }),

  // External service stubs (dry-run mode for dev/test)
  dryRunExternalStubs: parseBool(env('DRY_RUN_EXTERNAL_STUBS'), true),

  // URLs
  frontendUrl: env('FRONTEND_URL', 'http://localhost:5173'),
  backendUrl: env('BACKEND_URL', 'http://localhost:3000'),
});

export default config;
export { config };
