/**
 * Unit tests for the authorize middleware factory.
 *
 * Verifies RBAC enforcement logic in isolation from the HTTP layer so
 * permission-check bugs fail fast at the unit level.
 */

import { describe, it, expect, vi } from 'vitest';
import { authorize } from '../../src/middleware/authorize.js';

function mockReply() {
  const reply = {};
  reply.status = vi.fn().mockReturnValue(reply);
  reply.send = vi.fn().mockReturnValue(reply);
  return reply;
}

function mockRequest(user) {
  return { id: 'req-authz-1', user };
}

describe('authorize middleware', () => {
  it('passes through when the user holds the required permission', async () => {
    const handler = authorize('event:read');
    const request = mockRequest({
      userId: 'u-1',
      permissions: ['event:read', 'event:update'],
    });
    const reply = mockReply();

    await handler(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('passes through when the user holds ALL required permissions', async () => {
    const handler = authorize('event:read', 'event:update');
    const request = mockRequest({
      userId: 'u-1',
      permissions: ['event:read', 'event:update', 'event:close'],
    });
    const reply = mockReply();

    await handler(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
  });

  it('returns 403 FORBIDDEN when one of the required permissions is missing', async () => {
    const handler = authorize('event:read', 'event:approve');
    const request = mockRequest({
      userId: 'u-1',
      permissions: ['event:read'],
    });
    const reply = mockReply();

    await handler(request, reply);

    expect(reply.status).toHaveBeenCalledWith(403);
    const body = reply.send.mock.calls[0][0];
    expect(body.code).toBe('FORBIDDEN');
    expect(body.message).toBe('Insufficient permissions');
    expect(body.details).toEqual({
      required: ['event:read', 'event:approve'],
      actual: ['event:read'],
    });
    expect(body.requestId).toBe('req-authz-1');
  });

  it('returns 401 UNAUTHORIZED when request.user is unset (handler used without authenticate)', async () => {
    const handler = authorize('event:read');
    const request = mockRequest(null);
    const reply = mockReply();

    await handler(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send.mock.calls[0][0].code).toBe('UNAUTHORIZED');
  });

  it('treats a user with no permissions array as empty (403)', async () => {
    const handler = authorize('event:read');
    const request = mockRequest({ userId: 'u-1' });
    const reply = mockReply();

    await handler(request, reply);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send.mock.calls[0][0].details.actual).toEqual([]);
  });
});
