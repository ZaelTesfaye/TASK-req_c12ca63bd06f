/**
 * Unit tests for the authenticate middleware.
 *
 * Exercises token parsing, signature verification, expiry handling, and
 * malformed-header rejection in isolation so failures surface without
 * needing a full HTTP integration run.
 */

import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { authenticate } from '../../src/middleware/authenticate.js';
import config from '../../src/config/index.js';

function mockReply() {
  const reply = {};
  reply.status = vi.fn().mockReturnValue(reply);
  reply.send = vi.fn().mockReturnValue(reply);
  return reply;
}

function mockRequest(headers = {}) {
  return {
    id: 'req-test-1',
    headers,
    user: null,
  };
}

describe('authenticate middleware', () => {
  it('attaches user payload to request.user on a valid token', async () => {
    const token = jwt.sign(
      {
        userId: 'u-1',
        username: 'alice',
        roles: ['admin'],
        permissions: ['event:read'],
      },
      config.jwt.accessSecret,
      { expiresIn: '5m' },
    );

    const request = mockRequest({ authorization: `Bearer ${token}` });
    const reply = mockReply();

    await authenticate(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
    expect(request.user).toEqual({
      userId: 'u-1',
      username: 'alice',
      roles: ['admin'],
      permissions: ['event:read'],
    });
  });

  it('defaults roles and permissions to [] when missing from the token', async () => {
    const token = jwt.sign(
      { userId: 'u-2', username: 'bob' },
      config.jwt.accessSecret,
      { expiresIn: '5m' },
    );

    const request = mockRequest({ authorization: `Bearer ${token}` });
    const reply = mockReply();

    await authenticate(request, reply);

    expect(request.user).toEqual({
      userId: 'u-2',
      username: 'bob',
      roles: [],
      permissions: [],
    });
  });

  it('returns 401 UNAUTHORIZED when the Authorization header is missing', async () => {
    const request = mockRequest({});
    const reply = mockReply();

    await authenticate(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
    const body = reply.send.mock.calls[0][0];
    expect(body.code).toBe('UNAUTHORIZED');
    expect(body.requestId).toBe('req-test-1');
    expect(request.user).toBeNull();
  });

  it('returns 401 UNAUTHORIZED when the header is not a Bearer token', async () => {
    const request = mockRequest({ authorization: 'Basic aGVsbG8=' });
    const reply = mockReply();

    await authenticate(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send.mock.calls[0][0].code).toBe('UNAUTHORIZED');
  });

  it('returns 401 with "Invalid token" on a tampered signature', async () => {
    const token = jwt.sign({ userId: 'u-3' }, 'wrong-secret', { expiresIn: '5m' });

    const request = mockRequest({ authorization: `Bearer ${token}` });
    const reply = mockReply();

    await authenticate(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
    const body = reply.send.mock.calls[0][0];
    expect(body.code).toBe('UNAUTHORIZED');
    expect(body.message).toBe('Invalid token');
  });

  it('returns 401 with "Token has expired" on an expired token', async () => {
    const token = jwt.sign(
      { userId: 'u-4' },
      config.jwt.accessSecret,
      { expiresIn: '-1s' },
    );

    const request = mockRequest({ authorization: `Bearer ${token}` });
    const reply = mockReply();

    await authenticate(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
    const body = reply.send.mock.calls[0][0];
    expect(body.code).toBe('UNAUTHORIZED');
    expect(body.message).toBe('Token has expired');
  });
});
