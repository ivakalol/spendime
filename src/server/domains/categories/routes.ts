import { Router } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import { translateDatabaseError } from '../../db/errors.js';
import { ApiError } from '../../errors.js';
import { requireAuthentication } from '../../middleware/authenticate.js';
import { inUserTransaction, pickFields, requireRow } from '../../routes/helpers.js';
import { booleanQuerySchema, uuidSchema } from '../../validation/common.js';
import {
  archiveCategory, createCategory, getCategory, listCategories, updateCategory,
  type CategoryWrite,
} from './repository.js';

const categorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(['expense', 'income', 'both']),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional().default(null),
  icon: z.string().trim().max(50).nullable().optional().default(null),
}).strict();

export function createCategoriesRouter(pool: pg.Pool): Router {
  const router = Router();
  router.use(requireAuthentication(pool));
  router.get('/', async (request, response) => {
    const data = await inUserTransaction(pool, request, (client) =>
      listCategories(client, booleanQuerySchema.parse(request.query.includeArchived)));
    response.json({ data });
  });
  router.get('/:id', async (request, response) => {
    const id = uuidSchema.parse(request.params.id);
    const data = await inUserTransaction(pool, request, async (client) =>
      requireRow(await getCategory(client, id)));
    response.json({ data });
  });
  router.post('/', async (request, response) => {
    const input = categorySchema.parse(request.body) as CategoryWrite;
    try {
      const data = await inUserTransaction(pool, request, (client, userId) =>
        createCategory(client, userId, input));
      response.status(201).json({ data });
    } catch (error) { translateDatabaseError(error); }
  });
  router.patch('/:id', async (request, response) => {
    const id = uuidSchema.parse(request.params.id);
    try {
      const data = await inUserTransaction(pool, request, async (client) => {
        const current = requireRow(await getCategory(client, id));
        if (current.isSystem) {
          throw new ApiError(409, 'system_category_immutable', 'System categories cannot be edited.');
        }
        const input = categorySchema.parse({
          ...pickFields(current,['name','kind','color','icon']),...request.body,
        }) as CategoryWrite;
        return requireRow(await updateCategory(client, id, input));
      });
      response.json({ data });
    } catch (error) { translateDatabaseError(error); }
  });
  router.delete('/:id', async (request, response) => {
    const id = uuidSchema.parse(request.params.id);
    const archived = await inUserTransaction(pool, request, async (client) => {
      const current = requireRow(await getCategory(client, id));
      if (current.isSystem) {
        throw new ApiError(409, 'system_category_immutable', 'System categories cannot be archived.');
      }
      return archiveCategory(client, id);
    });
    requireRow(archived ? true : undefined);
    response.status(204).send();
  });
  return router;
}
