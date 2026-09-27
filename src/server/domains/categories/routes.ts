import { Router } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import { translateDatabaseError } from '../../db/errors.js';
import { ApiError } from '../../errors.js';
import { requireAuthentication } from '../../middleware/authenticate.js';
import { inUserTransaction, pickFields, requireRow } from '../../routes/helpers.js';
import { booleanQuerySchema, uuidSchema } from '../../validation/common.js';
import {
  archiveCategory, createCategory, getCategory, listCategories, updateCategory, restoreCategory, permanentlyDeleteCategory,
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
        const current = requireRow(await getCategory(client, id, true));
        if (current.isArchived) throw new ApiError(409,'category_archived','Restore this category before editing it.');
        const input = categorySchema.parse({
          ...pickFields(current,['name','kind','color','icon']),...request.body,
        }) as CategoryWrite;
        if (input.kind!==current.kind && input.kind!=='both') {
          const incompatible = await client.query(`SELECT 1 FROM (
            SELECT kind::text FROM transactions WHERE category_id=$1
            UNION ALL SELECT kind::text FROM recurring_rules WHERE category_id=$1
            UNION ALL SELECT CASE direction WHEN 'debit' THEN 'expense' ELSE 'income' END FROM bank_category_rules WHERE category_id=$1
          ) uses WHERE ($2='income' AND kind IN ('expense','refund')) OR ($2='expense' AND kind='income') LIMIT 1`,[id,input.kind]);
          if (incompatible.rowCount) throw new ApiError(409,'category_kind_in_use','This category is used by incompatible income or expense entries. Choose Both or keep its current type.');
        }
        return requireRow(await updateCategory(client, id, input));
      });
      response.json({ data });
    } catch (error) { translateDatabaseError(error); }
  });
  router.delete('/:id', async (request, response) => {
    const id = uuidSchema.parse(request.params.id);
    const archived = await inUserTransaction(pool, request, async (client) => {
      requireRow(await getCategory(client, id, true));
      return archiveCategory(client, id);
    });
    requireRow(archived ? true : undefined);
    response.status(204).send();
  });
  router.post('/:id/restore', async (request,response) => {
    const id=uuidSchema.parse(request.params.id);
    const data=await inUserTransaction(pool,request,async client=>{
      const current=requireRow(await getCategory(client,id,true));
      if (!current.isArchived) throw new ApiError(409,'category_not_archived','Only archived categories can be restored.');
      return requireRow(await restoreCategory(client,id));
    });
    response.json({data});
  });
  router.delete('/:id/permanent', async (request,response) => {
    const id=uuidSchema.parse(request.params.id);
    await inUserTransaction(pool,request,async client=>{
      const current=requireRow(await getCategory(client,id,true));
      if (!current.isArchived) throw new ApiError(409,'category_not_archived','Archive this category before deleting it permanently.');
      await permanentlyDeleteCategory(client,id);
    });
    response.status(204).send();
  });
  return router;
}
