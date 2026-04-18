/**
 * Recipes Routes
 *
 * Fastify plugin that registers recipe-related endpoints under the /recipes prefix.
 * Handles recipe CRUD, versioning, and the review/approval workflow.
 */

import { z } from 'zod';
import { createLogger } from '../../logging/index.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateBody, validateQuery, validateParams } from '../../middleware/validate.js';
import { parsePagination, formatPaginatedResponse } from '../../shared/pagination.js';
import { NotFoundError } from '../../shared/errors.js';
import * as recipesRepo from './repository.js';
import * as recipesService from './service.js';

const log = createLogger('recipes:routes');

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const createRecipeBodySchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().max(200).optional(),
  steps_json: z.any().optional(),
  quantities_json: z.any().optional(),
  difficulty: z.string().max(20).optional(),
  time_estimate_minutes: z.coerce.number().int().min(0).optional(),
  tags_json: z.any().optional(),
  rich_text_html: z.string().optional(),
});

const listRecipesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: z.enum(['draft', 'submitted_for_review', 'approved', 'rejected']).optional(),
});

const recipeIdParamSchema = z.object({
  id: z.string().uuid(),
});

const revisionBodySchema = z.object({
  title: z.string().min(1).max(200),
  steps_json: z.any().optional(),
  quantities_json: z.any().optional(),
  difficulty: z.string().max(20).optional(),
  time_estimate_minutes: z.coerce.number().int().min(0).optional(),
  tags_json: z.any().optional(),
  rich_text_html: z.string().optional(),
});

const rejectBodySchema = z.object({
  notes: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {object} _opts
 */
async function recipesRoutes(fastify, _opts) {

  // -------------------------------------------------------------------------
  // POST /recipes - Create a new recipe
  // -------------------------------------------------------------------------
  fastify.post(
    '/recipes',
    {
      preHandler: [
        authenticate,
        authorize('recipe:create'),
        validateBody(createRecipeBodySchema),
      ],
    },
    async (request, reply) => {
      const { recipe, version } = await recipesService.createRecipe(
        request.user.userId,
        request.body,
      );

      log.info(
        { action: 'create', recipeId: recipe.id, versionId: version.id },
        'Recipe created',
      );

      return reply.status(201).send({ data: { recipe, version } });
    },
  );

  // -------------------------------------------------------------------------
  // GET /recipes - List recipes (paginated, optional status filter)
  // -------------------------------------------------------------------------
  fastify.get(
    '/recipes',
    {
      preHandler: [
        authenticate,
        validateQuery(listRecipesQuerySchema),
      ],
    },
    async (request, reply) => {
      const { status } = request.query;
      const pagination = parsePagination(request.query);

      let result;
      if (status === 'approved') {
        // Shortcut: return only approved recipes
        const approved = await recipesRepo.findApproved();
        result = { data: approved, total: approved.length };
      } else {
        result = await recipesRepo.findAll({ ...pagination, status });
      }

      log.info(
        { action: 'list', page: pagination.page, total: result.total, status },
        'Listed recipes',
      );

      return reply.status(200).send(
        formatPaginatedResponse(result.data, result.total, pagination),
      );
    },
  );

  // -------------------------------------------------------------------------
  // GET /recipes/:id - Get a recipe with all versions
  // -------------------------------------------------------------------------
  fastify.get(
    '/recipes/:id',
    {
      preHandler: [
        authenticate,
        validateParams(recipeIdParamSchema),
      ],
    },
    async (request, reply) => {
      const { id } = request.params;

      const recipe = await recipesRepo.findById(id);
      if (!recipe) {
        throw new NotFoundError('Recipe', id);
      }

      // Attach all versions
      const versions = await recipesRepo.findVersionsByRecipeId(id);
      recipe.versions = versions;

      log.info({ action: 'getById', recipeId: id }, 'Retrieved recipe by id');

      return reply.status(200).send({ data: recipe });
    },
  );

  // -------------------------------------------------------------------------
  // POST /recipes/:id/revisions - Create a new revision for a recipe
  // -------------------------------------------------------------------------
  fastify.post(
    '/recipes/:id/revisions',
    {
      preHandler: [
        authenticate,
        authorize('recipe:create'),
        validateParams(recipeIdParamSchema),
        validateBody(revisionBodySchema),
      ],
    },
    async (request, reply) => {
      const { id } = request.params;

      const version = await recipesService.createRevision(
        request.user.userId,
        id,
        request.body,
      );

      log.info(
        { action: 'createRevision', recipeId: id, versionId: version.id },
        'Recipe revision created',
      );

      return reply.status(201).send({ data: version });
    },
  );

  // -------------------------------------------------------------------------
  // POST /recipes/:id/submit-review - Submit latest version for review
  // -------------------------------------------------------------------------
  fastify.post(
    '/recipes/:id/submit-review',
    {
      preHandler: [
        authenticate,
        authorize('recipe:review'),
        validateParams(recipeIdParamSchema),
      ],
    },
    async (request, reply) => {
      const { id } = request.params;

      const version = await recipesService.submitForReview(
        request.user.userId,
        id,
      );

      log.info(
        { action: 'submitForReview', recipeId: id, versionId: version.id },
        'Recipe submitted for review',
      );

      return reply.status(200).send({ data: version });
    },
  );

  // -------------------------------------------------------------------------
  // POST /recipes/:id/approve - Approve the submitted version
  // -------------------------------------------------------------------------
  fastify.post(
    '/recipes/:id/approve',
    {
      preHandler: [
        authenticate,
        authorize('recipe:approve'),
        validateParams(recipeIdParamSchema),
      ],
    },
    async (request, reply) => {
      const { id } = request.params;

      const version = await recipesService.approveRecipe(
        request.user.userId,
        id,
      );

      log.info(
        { action: 'approve', recipeId: id, versionId: version.id },
        'Recipe approved',
      );

      return reply.status(200).send({ data: version });
    },
  );

  // -------------------------------------------------------------------------
  // POST /recipes/:id/reject - Reject the submitted version
  // -------------------------------------------------------------------------
  fastify.post(
    '/recipes/:id/reject',
    {
      preHandler: [
        authenticate,
        authorize('recipe:approve'),
        validateParams(recipeIdParamSchema),
        validateBody(rejectBodySchema),
      ],
    },
    async (request, reply) => {
      const { id } = request.params;
      const { notes } = request.body;

      const version = await recipesService.rejectRecipe(
        request.user.userId,
        id,
        notes,
      );

      log.info(
        { action: 'reject', recipeId: id, versionId: version.id },
        'Recipe rejected',
      );

      return reply.status(200).send({ data: version });
    },
  );
}

export default recipesRoutes;
