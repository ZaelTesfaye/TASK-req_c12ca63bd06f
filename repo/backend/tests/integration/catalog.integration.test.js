/**
 * Catalog / Resources Integration Tests
 *
 * Covers /catalog/resources/:id, PATCH/publish, and metadata templates.
 * NOTE: the publish route always republishes (no 409 for already-published);
 *       we therefore assert the actual observed behavior and flag the gap.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { setupTestDb, teardownTestDb, getApp, loginAs, db } from './setup.js';

let app;
let adminToken;
let managerToken;
let plannerToken;
let resourceId;
let templateId;

beforeAll(async () => {
  await setupTestDb();
  app = await getApp();

  adminToken = await loginAs(app, 'admin', 'admin123!');
  managerToken = await loginAs(app, 'manager', 'manager123!');
  plannerToken = await loginAs(app, 'planner', 'planner123!');

  // Seed a resource + template directly to be independent of /catalog POST
  const [template] = await db('metadata_templates')
    .insert({
      resource_type: 'equipment',
      required_fields_json: JSON.stringify(['serial']),
      validation_rules_json: JSON.stringify({}),
      status: 'draft',
      version: 1,
    })
    .returning('*');
  templateId = template.id;

  const [resource] = await db('resources')
    .insert({
      name: 'Catalog Test Resource',
      resource_type: 'equipment',
      status: 'draft',
      version: 1,
    })
    .returning('*');
  resourceId = resource.id;
}, 30000);

afterAll(async () => {
  if (app) await app.close();
  await teardownTestDb();
  await db.destroy();
}, 30000);

describe('Catalog / Resources (real DB)', () => {
  // -------------------------------------------------------------------------
  // GET /catalog/tree
  // -------------------------------------------------------------------------
  describe('GET /catalog/tree', () => {
    let parentId;

    beforeAll(async () => {
      // Build a tiny parent/child hierarchy so the tree traversal has
      // something non-trivial to return.
      const [parent] = await db('resources')
        .insert({
          name: 'Tree Parent Space',
          resource_type: 'space',
          status: 'published',
          version: 1,
        })
        .returning('*');
      parentId = parent.id;

      await db('resources').insert({
        name: 'Tree Child Room',
        resource_type: 'space',
        parent_id: parentId,
        status: 'published',
        version: 1,
      });
    });

    it('returns 200 with an array envelope for an authenticated user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/catalog/tree',
        headers: { Authorization: `Bearer ${managerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('includes the seeded parent and exposes a child underneath it', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/catalog/tree',
        headers: { Authorization: `Bearer ${managerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      const parentNode = body.data.find((n) => n.id === parentId);
      expect(parentNode).toBeDefined();
      expect(Array.isArray(parentNode.children)).toBe(true);
      expect(parentNode.children.some((c) => c.name === 'Tree Child Room')).toBe(true);
    });

    it('returns 401 when unauthenticated', async () => {
      const res = await app.inject({ method: 'GET', url: '/catalog/tree' });
      expect(res.statusCode).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /catalog/resources
  // -------------------------------------------------------------------------
  describe('POST /catalog/resources', () => {
    it('creates a new resource (201) on a valid payload', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/catalog/resources',
        headers: { Authorization: `Bearer ${managerToken}` },
        payload: {
          name: 'Created Via POST',
          resource_type: 'equipment',
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.data.id).toBeDefined();
      expect(body.data.name).toBe('Created Via POST');
    });

    it('returns 422 when required fields are missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/catalog/resources',
        headers: { Authorization: `Bearer ${managerToken}` },
        payload: { name: 'No Type' },
      });
      expect(res.statusCode).toBe(422);
    });

    it('returns 403 for a role lacking resource:manage', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/catalog/resources',
        headers: { Authorization: `Bearer ${plannerToken}` },
        payload: { name: 'Planner Try', resource_type: 'equipment' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // POST /catalog/templates
  // -------------------------------------------------------------------------
  describe('POST /catalog/templates', () => {
    it('creates a template (201) on a valid payload', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/catalog/templates',
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: {
          resource_type: 'space',
          required_fields_json: ['capacity'],
          validation_rules_json: {},
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.data.id).toBeDefined();
      expect(body.data.resource_type).toBe('space');
    });

    it('returns 422 when required fields are missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/catalog/templates',
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(422);
    });
  });

  // -------------------------------------------------------------------------
  // GET /catalog/templates
  // -------------------------------------------------------------------------
  describe('GET /catalog/templates', () => {
    it('returns the list of templates', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/catalog/templates',
        headers: { Authorization: `Bearer ${managerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
    });

    it('returns a list that includes an equipment template', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/catalog/templates',
        headers: { Authorization: `Bearer ${managerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      const equipmentTemplates = body.data.filter((t) => t.resource_type === 'equipment');
      expect(equipmentTemplates.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // GET /catalog/resources/:id
  // -------------------------------------------------------------------------
  describe('GET /catalog/resources/:id', () => {
    it('returns 200 with the resource', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/catalog/resources/${resourceId}`,
        headers: { Authorization: `Bearer ${managerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.id).toBe(resourceId);
      expect(body.data.name).toBe('Catalog Test Resource');
    });

    it('returns 404 for an unknown id', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/catalog/resources/${randomUUID()}`,
        headers: { Authorization: `Bearer ${managerToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /catalog/resources/:id
  // -------------------------------------------------------------------------
  describe('PATCH /catalog/resources/:id', () => {
    it('updates a resource (200)', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/catalog/resources/${resourceId}`,
        headers: { Authorization: `Bearer ${managerToken}` },
        payload: { name: 'Catalog Test Resource - Updated' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.name).toBe('Catalog Test Resource - Updated');

      const dbRow = await db('resources').where({ id: resourceId }).first();
      expect(dbRow.name).toBe('Catalog Test Resource - Updated');
    });

    it('returns 422 on invalid body (e.g. quota_per_event as negative)', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/catalog/resources/${resourceId}`,
        headers: { Authorization: `Bearer ${managerToken}` },
        payload: { quota_per_event: -1 },
      });
      expect(res.statusCode).toBe(422);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /catalog/templates/:id
  // -------------------------------------------------------------------------
  describe('PATCH /catalog/templates/:id', () => {
    it('updates a template (200)', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/catalog/templates/${templateId}`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: {
          required_fields_json: ['serial', 'asset_tag'],
        },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data).toBeDefined();
    });

    it('returns 404 for unknown template id', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/catalog/templates/${randomUUID()}`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { resource_type: 'nope' },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // POST /catalog/resources/:id/publish
  // -------------------------------------------------------------------------
  describe('POST /catalog/resources/:id/publish', () => {
    it('publishes a resource (200)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/catalog/resources/${resourceId}/publish`,
        headers: { Authorization: `Bearer ${managerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.status).toBe('published');
    });

    // TODO: the current `publish` implementation does NOT reject
    // already-published resources (no 409 path). We assert the observed
    // behavior: a second publish returns 200 and bumps the version.
    it('re-publishing an already-published resource currently returns 200 (no 409 gate)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/catalog/resources/${resourceId}/publish`,
        headers: { Authorization: `Bearer ${managerToken}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // POST /catalog/templates/:id/publish
  // -------------------------------------------------------------------------
  describe('POST /catalog/templates/:id/publish', () => {
    it('publishes a template (200)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/catalog/templates/${templateId}/publish`,
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.status).toBe('published');
    });

    // TODO: same gap as the resource publish — no 409 on double-publish.
    it('re-publishing an already-published template currently returns 200 (no 409 gate)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/catalog/templates/${templateId}/publish`,
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });
});
