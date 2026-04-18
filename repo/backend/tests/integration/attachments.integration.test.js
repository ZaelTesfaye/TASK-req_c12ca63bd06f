/**
 * Attachments Integration Tests
 *
 * Covers multipart upload, list, and download for /attachments.
 * Uses the `form-data` npm package (present as a transitive dependency of
 * @fastify/multipart's ecosystem) to build a proper multipart body.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import FormData from 'form-data';
import { setupTestDb, teardownTestDb, getApp, loginAs, db } from './setup.js';

let app;
let plannerToken;
let chefToken;
let eventId;

beforeAll(async () => {
  await setupTestDb();
  app = await getApp();

  plannerToken = await loginAs(app, 'planner', 'planner123!');
  chefToken = await loginAs(app, 'chef', 'chef123!');

  // Event to attach files to
  const eventRes = await app.inject({
    method: 'POST',
    url: '/events',
    headers: { Authorization: `Bearer ${plannerToken}` },
    payload: {
      title: 'Attachment Test Event',
      event_date: '2026-03-01',
      headcount: 10,
      budget_amount: 1000,
    },
  });
  eventId = JSON.parse(eventRes.payload).data.id;
}, 30000);

afterAll(async () => {
  if (app) await app.close();
  await teardownTestDb();
  await db.destroy();
}, 30000);

describe('Attachments (real DB)', () => {
  // -------------------------------------------------------------------------
  // GET /attachments (empty list)
  // -------------------------------------------------------------------------
  describe('GET /attachments', () => {
    it('returns an empty list for a fresh event (200 with data array)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/attachments?event_id=${eventId}`,
        headers: { Authorization: `Bearer ${plannerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // POST /attachments?event_id=...
  // -------------------------------------------------------------------------
  describe('POST /attachments', () => {
    it('uploads a PNG and returns a data array including sha256 + id', async () => {
      // Build a minimal in-memory PNG byte sequence (8-byte PNG header +
      // a tiny IHDR chunk). The attachment service validates MIME, not magic.
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00,
      ]);

      const form = new FormData();
      form.append('file', pngBuffer, {
        filename: 'tiny.png',
        contentType: 'image/png',
      });

      const res = await app.inject({
        method: 'POST',
        url: `/attachments?event_id=${eventId}`,
        headers: {
          Authorization: `Bearer ${plannerToken}`,
          ...form.getHeaders(),
        },
        payload: form.getBuffer(),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(1);

      const entry = body.data[0];
      // On success, the service returns `{ filename, status: 'success', attachment }`
      expect(entry.status).toBe('success');
      expect(entry.attachment).toBeDefined();
      expect(entry.attachment.id).toBeDefined();
      expect(entry.attachment.sha256_hex).toMatch(/^[0-9a-f]{64}$/);
    });

    it('rejects an upload targeting another user\'s event with 403', async () => {
      // chef has attachment:upload but does not own the planner's event and
      // has no manager_event_scopes row for it — parent-access must deny.
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00,
      ]);
      const form = new FormData();
      form.append('file', pngBuffer, {
        filename: 'forbidden.png',
        contentType: 'image/png',
      });

      const res = await app.inject({
        method: 'POST',
        url: `/attachments?event_id=${eventId}`,
        headers: {
          Authorization: `Bearer ${chefToken}`,
          ...form.getHeaders(),
        },
        payload: form.getBuffer(),
      });

      expect(res.statusCode).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // GET /attachments/:id
  // -------------------------------------------------------------------------
  describe('GET /attachments/:id', () => {
    let metadataAttachmentId;

    beforeAll(async () => {
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0xbb,
      ]);
      const form = new FormData();
      form.append('file', pngBuffer, {
        filename: 'metadata-target.png',
        contentType: 'image/png',
      });

      const uploadRes = await app.inject({
        method: 'POST',
        url: `/attachments?event_id=${eventId}`,
        headers: {
          Authorization: `Bearer ${plannerToken}`,
          ...form.getHeaders(),
        },
        payload: form.getBuffer(),
      });
      metadataAttachmentId = JSON.parse(uploadRes.payload).data[0].attachment.id;
    });

    it('returns attachment metadata for a valid id (200)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/attachments/${metadataAttachmentId}`,
        headers: { Authorization: `Bearer ${plannerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.id).toBe(metadataAttachmentId);
      expect(body.data.original_name).toBe('metadata-target.png');
      expect(body.data.sha256_hex).toMatch(/^[0-9a-f]{64}$/);
    });

    it('returns 404 for a nonexistent attachment id', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/attachments/${randomUUID()}`,
        headers: { Authorization: `Bearer ${plannerToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 403 when the attachment belongs to another user\'s event', async () => {
      // chef is not the creator of this event and has no manager_event_scope
      const res = await app.inject({
        method: 'GET',
        url: `/attachments/${metadataAttachmentId}`,
        headers: { Authorization: `Bearer ${chefToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // GET /attachments/:id/download
  // -------------------------------------------------------------------------
  describe('GET /attachments/:id/download', () => {
    it('returns 200 with Content-Disposition containing the original filename', async () => {
      // Re-upload so we have a fresh attachment row to download
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0xaa,
      ]);
      const form = new FormData();
      form.append('file', pngBuffer, {
        filename: 'download-me.png',
        contentType: 'image/png',
      });

      const uploadRes = await app.inject({
        method: 'POST',
        url: `/attachments?event_id=${eventId}`,
        headers: {
          Authorization: `Bearer ${plannerToken}`,
          ...form.getHeaders(),
        },
        payload: form.getBuffer(),
      });
      expect(uploadRes.statusCode).toBe(200);
      const uploadBody = JSON.parse(uploadRes.payload);
      const attachmentId = uploadBody.data[0].attachment.id;

      const res = await app.inject({
        method: 'GET',
        url: `/attachments/${attachmentId}/download`,
        headers: { Authorization: `Bearer ${plannerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const contentDisposition =
        res.headers['content-disposition'] || res.headers['Content-Disposition'];
      expect(contentDisposition).toBeDefined();
      expect(String(contentDisposition)).toContain('download-me.png');
    });

    it('returns 404 for an unknown attachment id', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/attachments/${randomUUID()}/download`,
        headers: { Authorization: `Bearer ${plannerToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
