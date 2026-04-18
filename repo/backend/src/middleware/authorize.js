/**
 * Permission-Based Authorization Middleware
 *
 * Fastify preHandler factory that checks whether the authenticated user
 * holds ALL of the required permissions.
 */

/**
 * Create a Fastify preHandler that enforces required permissions.
 *
 * @param {...string} requiredPermissions - One or more permission strings the user must have
 * @returns {import('fastify').preHandlerHookHandler}
 */
export function authorize(...requiredPermissions) {
  return async function authorizeHandler(request, reply) {
    // Ensure the user has been authenticated first
    if (!request.user) {
      return reply.status(401).send({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
        details: null,
        requestId: request.id,
      });
    }

    const userPermissions = request.user.permissions || [];

    const hasAll = requiredPermissions.every((perm) =>
      userPermissions.includes(perm)
    );

    if (!hasAll) {
      return reply.status(403).send({
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
        details: {
          required: requiredPermissions,
          actual: userPermissions,
        },
        requestId: request.id,
      });
    }
  };
}
