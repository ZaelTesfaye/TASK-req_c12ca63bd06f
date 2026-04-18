/**
 * JWT Authentication Middleware
 *
 * Fastify preHandler hook that verifies Bearer tokens from the Authorization header
 * and attaches the decoded user payload to the request.
 */

import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import { createLogger } from '../logging/index.js';

const log = createLogger('auth');

/**
 * Fastify preHandler that authenticates requests via JWT Bearer tokens.
 *
 * On success, attaches `{ userId, username, roles, permissions }` to `request.user`.
 * On failure, replies with a 401 structured error.
 *
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 */
export async function authenticate(request, reply) {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    log.warn({ action: 'authenticate' }, 'Missing or malformed Authorization header');
    return reply.status(401).send({
      code: 'UNAUTHORIZED',
      message: 'Missing or malformed Authorization header',
      details: null,
      requestId: request.id,
    });
  }

  const token = authHeader.slice(7); // Strip "Bearer "

  try {
    const decoded = jwt.verify(token, config.jwt.accessSecret);

    request.user = {
      userId: decoded.userId,
      username: decoded.username,
      roles: decoded.roles || [],
      permissions: decoded.permissions || [],
    };
  } catch (err) {
    const isExpired = err.name === 'TokenExpiredError';
    const message = isExpired ? 'Token has expired' : 'Invalid token';

    log.warn(
      { action: 'authenticate', error: err.name },
      message
    );

    return reply.status(401).send({
      code: 'UNAUTHORIZED',
      message,
      details: null,
      requestId: request.id,
    });
  }
}
