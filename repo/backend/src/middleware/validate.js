/**
 * Zod Validation Middleware
 *
 * Fastify preHandler factories that validate request body, query, or params
 * against a Zod schema. Returns 422 with structured validation errors on failure.
 */

/**
 * Format Zod issues into a consistent error response array.
 *
 * @param {import('zod').ZodIssue[]} issues
 * @returns {Array<{ path: string, message: string }>}
 */
function formatZodErrors(issues) {
  return issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

/**
 * Create a preHandler that validates `request.body` against the provided Zod schema.
 *
 * @param {import('zod').ZodSchema} zodSchema
 * @returns {import('fastify').preHandlerHookHandler}
 */
export function validateBody(zodSchema) {
  return async function validateBodyHandler(request, reply) {
    const result = zodSchema.safeParse(request.body);

    if (!result.success) {
      return reply.status(422).send({
        code: 'VALIDATION_ERROR',
        message: 'Request body validation failed',
        details: { errors: formatZodErrors(result.error.issues) },
        requestId: request.id,
      });
    }

    // Replace body with the parsed (and potentially transformed/defaulted) value
    request.body = result.data;
  };
}

/**
 * Create a preHandler that validates `request.query` against the provided Zod schema.
 *
 * @param {import('zod').ZodSchema} zodSchema
 * @returns {import('fastify').preHandlerHookHandler}
 */
export function validateQuery(zodSchema) {
  return async function validateQueryHandler(request, reply) {
    const result = zodSchema.safeParse(request.query);

    if (!result.success) {
      return reply.status(422).send({
        code: 'VALIDATION_ERROR',
        message: 'Query parameter validation failed',
        details: { errors: formatZodErrors(result.error.issues) },
        requestId: request.id,
      });
    }

    request.query = result.data;
  };
}

/**
 * Create a preHandler that validates `request.params` against the provided Zod schema.
 *
 * @param {import('zod').ZodSchema} zodSchema
 * @returns {import('fastify').preHandlerHookHandler}
 */
export function validateParams(zodSchema) {
  return async function validateParamsHandler(request, reply) {
    const result = zodSchema.safeParse(request.params);

    if (!result.success) {
      return reply.status(422).send({
        code: 'VALIDATION_ERROR',
        message: 'Path parameter validation failed',
        details: { errors: formatZodErrors(result.error.issues) },
        requestId: request.id,
      });
    }

    request.params = result.data;
  };
}
