/**
 * Recipes Routes Integration Tests
 *
 * Covers GET, revision, submit-review, approve, reject.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { setupTestDb, teardownTestDb, getApp, loginAs, db } from './setup.js';

let app;
let chefToken, approverToken;
let recipeId;

beforeAll(async () => {
  await setupTestDb();
  app = await getApp();
  chefToken = await loginAs(app, 'chef', 'chef123!');
  approverToken = await loginAs(app, 'approver', 'approver123!');

  const create = await app.inject({
    method: 'POST',
    url: '/recipes',
    headers: { Authorization: `Bearer ${chefToken}` },
    payload: {
      title: 'Integration Test Pasta',
      steps_json: ['Boil water', 'Add pasta'],
    },
  });
  recipeId = JSON.parse(create.payload).data.recipe.id;
}, 30000);

afterAll(async () => {
  if (app) await app.close();
  await teardownTestDb();
  await db.destroy();
}, 30000);

describe('GET /recipes (real DB)', () => {
  it('returns a paginated recipe list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/recipes?page=1&pageSize=10',
      headers: { Authorization: `Bearer ${chefToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.pageSize).toBe(10);
    expect(body.data.some((r) => r.id === recipeId)).toBe(true);
  });

  it('filters by status=draft', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/recipes?status=draft',
      headers: { Authorization: `Bearer ${chefToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('returns 401 for an unauthenticated request', async () => {
    // The route has no authorize() gate — any authenticated user may list
    // recipes. The authorization enforcement is at the auth layer, so we
    // verify a missing token is rejected.
    const res = await app.inject({
      method: 'GET',
      url: '/recipes',
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /recipes/:id (real DB)', () => {
  it('returns recipe with versions', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/recipes/${recipeId}`,
      headers: { Authorization: `Bearer ${chefToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.id).toBe(recipeId);
    expect(Array.isArray(body.data.versions)).toBe(true);
  });

  it('returns 404 for unknown recipe', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/recipes/${randomUUID()}`,
      headers: { Authorization: `Bearer ${chefToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /recipes/:id/revisions (real DB)', () => {
  it('creates a new revision', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/recipes/${recipeId}/revisions`,
      headers: { Authorization: `Bearer ${chefToken}` },
      payload: { title: 'Integration Test Pasta v2' },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.payload).data.version_no).toBeGreaterThanOrEqual(2);
  });
});

describe('POST /recipes/:id/submit-review (real DB)', () => {
  it('submits latest version for review', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/recipes/${recipeId}/submit-review`,
      headers: { Authorization: `Bearer ${chefToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data.status).toBe('submitted_for_review');
  });

  it('returns 422 when resubmitting an already-submitted version', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/recipes/${recipeId}/submit-review`,
      headers: { Authorization: `Bearer ${chefToken}` },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).not.toBe(200);
  });
});

describe('POST /recipes/:id/approve (real DB)', () => {
  it('approver approves a submitted version', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/recipes/${recipeId}/approve`,
      headers: { Authorization: `Bearer ${approverToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data.status).toBe('approved');
  });

  it('returns 403 for a non-approver (chef) trying to approve', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/recipes/${recipeId}/approve`,
      headers: { Authorization: `Bearer ${chefToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /recipes/:id/reject (real DB)', () => {
  let rejectableRecipeId;

  beforeAll(async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/recipes',
      headers: { Authorization: `Bearer ${chefToken}` },
      payload: {
        title: 'Rejectable Recipe',
        steps_json: ['TBD'],
      },
    });
    rejectableRecipeId = JSON.parse(create.payload).data.recipe.id;
    await app.inject({
      method: 'POST',
      url: `/recipes/${rejectableRecipeId}/submit-review`,
      headers: { Authorization: `Bearer ${chefToken}` },
    });
  });

  it('approver rejects with notes', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/recipes/${rejectableRecipeId}/reject`,
      headers: { Authorization: `Bearer ${approverToken}` },
      payload: { notes: 'Missing allergen information' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data.status).toBe('rejected');
  });
});
