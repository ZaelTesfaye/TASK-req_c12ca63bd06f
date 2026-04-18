/**
 * Unit tests for the validate middleware (body/query/params).
 *
 * These assertions cover the Zod validation pipeline in isolation from
 * Fastify so schema-shape regressions surface without booting the app.
 */

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import {
  validateBody,
  validateQuery,
  validateParams,
} from '../../src/middleware/validate.js';

function mockReply() {
  const reply = {};
  reply.status = vi.fn().mockReturnValue(reply);
  reply.send = vi.fn().mockReturnValue(reply);
  return reply;
}

describe('validateBody', () => {
  const schema = z.object({
    title: z.string().min(1),
    count: z.coerce.number().int().min(0),
  });

  it('replaces request.body with the parsed (coerced) value on success', async () => {
    const handler = validateBody(schema);
    const request = { id: 'req-1', body: { title: 'Hello', count: '42' } };
    const reply = mockReply();

    await handler(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
    expect(request.body).toEqual({ title: 'Hello', count: 42 });
  });

  it('returns 422 VALIDATION_ERROR with path/message pairs on failure', async () => {
    const handler = validateBody(schema);
    const request = { id: 'req-2', body: { title: '', count: -1 } };
    const reply = mockReply();

    await handler(request, reply);

    expect(reply.status).toHaveBeenCalledWith(422);
    const body = reply.send.mock.calls[0][0];
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.message).toBe('Request body validation failed');
    expect(Array.isArray(body.details.errors)).toBe(true);
    expect(body.details.errors.length).toBeGreaterThan(0);
    for (const err of body.details.errors) {
      expect(typeof err.path).toBe('string');
      expect(typeof err.message).toBe('string');
    }
    expect(body.requestId).toBe('req-2');
  });
});

describe('validateQuery', () => {
  const schema = z.object({
    page: z.coerce.number().int().min(1).default(1),
  });

  it('parses and coerces query strings on success', async () => {
    const handler = validateQuery(schema);
    const request = { id: 'q-1', query: { page: '3' } };
    const reply = mockReply();

    await handler(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
    expect(request.query.page).toBe(3);
  });

  it('returns 422 with "Query parameter validation failed" on bad input', async () => {
    const handler = validateQuery(schema);
    const request = { id: 'q-2', query: { page: '0' } };
    const reply = mockReply();

    await handler(request, reply);

    expect(reply.status).toHaveBeenCalledWith(422);
    const body = reply.send.mock.calls[0][0];
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.message).toBe('Query parameter validation failed');
  });
});

describe('validateParams', () => {
  const schema = z.object({ id: z.string().uuid() });

  it('accepts a valid UUID path parameter', async () => {
    const handler = validateParams(schema);
    const request = {
      id: 'p-1',
      params: { id: '11111111-1111-1111-1111-111111111111' },
    };
    const reply = mockReply();

    await handler(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
  });

  it('returns 422 with "Path parameter validation failed" on an invalid UUID', async () => {
    const handler = validateParams(schema);
    const request = { id: 'p-2', params: { id: 'not-a-uuid' } };
    const reply = mockReply();

    await handler(request, reply);

    expect(reply.status).toHaveBeenCalledWith(422);
    const body = reply.send.mock.calls[0][0];
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.message).toBe('Path parameter validation failed');
    expect(body.details.errors[0].path).toBe('id');
  });
});
