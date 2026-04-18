/**
 * Centralized Structured Logger
 *
 * Built on pino (Fastify's default logger).
 * Format convention: [module][action] message
 *
 * Usage:
 *   import { createLogger } from '../logging/index.js';
 *   const log = createLogger('users');
 *   log.info({ action: 'create', userId: '123' }, 'User created');
 *   // => {"level":30,"module":"users","action":"create","userId":"123","msg":"[users][create] User created", ...}
 */

import pino from 'pino';
import config from '../config/index.js';

// ---------------------------------------------------------------------------
// Sensitive fields that must NEVER appear in log output
// ---------------------------------------------------------------------------
const REDACTED_PATHS = [
  'password',
  'token',
  'authorization',
  'cookie',
  'ssn',
  'secret',
  'credit_card',
  'creditCard',
  'encryption_key',
  'encryptionKey',
  'refreshToken',
  'accessToken',
  'req.headers.authorization',
  'req.headers.cookie',
];

// ---------------------------------------------------------------------------
// Root logger instance
// ---------------------------------------------------------------------------

const rootLogger = pino({
  level: config.nodeEnv === 'production' ? 'info' : 'debug',

  // Redact sensitive fields from any log object
  redact: {
    paths: REDACTED_PATHS,
    censor: '[REDACTED]',
  },

  // Custom serializers for request / response objects
  serializers: {
    req(request) {
      if (!request) return request;
      return {
        method: request.method,
        url: request.url,
        requestId: request.id,
        hostname: request.hostname,
        remoteAddress: request.ip,
      };
    },
    res(reply) {
      if (!reply) return reply;
      return {
        statusCode: reply.statusCode,
      };
    },
    err: pino.stdSerializers.err,
  },

  // Pino transport for pretty printing in development
  ...(config.nodeEnv !== 'production' && {
    transport: {
      target: 'pino/file',
      options: { destination: 1 }, // stdout
    },
  }),

  // Attach a base timestamp
  timestamp: pino.stdTimeFunctions.isoTime,
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a child logger scoped to a module.
 *
 * The returned logger automatically:
 *  - Includes `module` in every entry
 *  - Formats messages as [module][action] when an `action` field is present
 *
 * @param {string} moduleName - Logical module name (e.g. 'users', 'auth', 'backup')
 * @returns {import('pino').Logger} A pino child logger
 */
export function createLogger(moduleName) {
  const child = rootLogger.child({ module: moduleName });

  // Wrap pino log methods to prepend [module][action] to messages
  const wrapped = Object.create(child);

  for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) {
    wrapped[level] = function (objOrMsg, ...args) {
      // pino supports: log.info(obj, msg) and log.info(msg)
      if (typeof objOrMsg === 'object' && objOrMsg !== null) {
        const action = objOrMsg.action || 'general';
        const msg = args[0];
        if (typeof msg === 'string') {
          args[0] = `[${moduleName}][${action}] ${msg}`;
        }
        return child[level].call(child, objOrMsg, ...args);
      }
      // Plain string message — no action context
      return child[level].call(
        child,
        `[${moduleName}][general] ${objOrMsg}`,
        ...args
      );
    };
  }

  // Allow creating sub-children (e.g. per-request)
  wrapped.child = (bindings) => child.child(bindings);

  return wrapped;
}

/**
 * Return the raw root pino instance.
 * Prefer `createLogger(module)` for application code.
 */
export function getRootLogger() {
  return rootLogger;
}

export default { createLogger, getRootLogger };
