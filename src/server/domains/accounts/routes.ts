import { Router } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import { translateDatabaseError } from '../../db/errors.js';
import { ApiError } from '../../errors.js';
import { requireAuthentication } from '../../middleware/authenticate.js';
import { inUserTransaction, pickFields, requireRow } from '../../routes/helpers.js';
import { booleanQuerySchema, currencySchema, signedMoneySchema, uuidSchema } from '../../validation/common.js';
import {
  archiveAccount, createAccount, getAccount, listAccounts, updateAccount,
  type AccountWrite,
} from './repository.js';

const accountSchema = z.object({
  name: z.string().trim().min(1).max(100),
  kind: z.enum(['cash', 'checking', 'savings', 'credit', 'investment', 'other']),
  currency: currencySchema,
  openingBalance: signedMoneySchema.default('0'),
  institution: z.string().trim().max(120).nullable().optional().default(null),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional().default(null),
  icon: z.string().trim().max(50).nullable().optional().default(null),
}).strict();

export function createAccountsRouter(pool: pg.Pool): Router {
  const router = Router();
  router.use(requireAuthentication(pool));

  router.get('/', async (request, response) => {
    const includeArchived = booleanQuerySchema.parse(request.query.includeArchived);
    const data = await inUserTransaction(pool, request, (client) =>
      listAccounts(client, includeArchived));
    response.json({ data });
  });

  router.get('/:id', async (request, response) => {
    const id = uuidSchema.parse(request.params.id);
    const data = await inUserTransaction(pool, request, async (client) =>
      requireRow(await getAccount(client, id)));
    response.json({ data });
  });

  router.post('/', async (request, response) => {
    const input = accountSchema.parse(request.body) as AccountWrite;
    try {
      const data = await inUserTransaction(pool, request, (client, userId) =>
        createAccount(client, userId, input));
      response.status(201).json({ data });
    } catch (error) { translateDatabaseError(error); }
  });

  router.patch('/:id', async (request, response) => {
    const id = uuidSchema.parse(request.params.id);
    try {
      const data = await inUserTransaction(pool, request, async (client) => {
        const current = requireRow(await getAccount(client, id));
        const input = accountSchema.parse({
          ...pickFields(current,['name','kind','currency','openingBalance','institution','color','icon']),
          ...request.body,
        }) as AccountWrite;
        if (input.currency !== current.currency) {
          throw new ApiError(409, 'currency_immutable', 'Account currency cannot be changed.');
        }
        return requireRow(await updateAccount(client, id, input));
      });
      response.json({ data });
    } catch (error) { translateDatabaseError(error); }
  });

  router.delete('/:id', async (request, response) => {
    const id = uuidSchema.parse(request.params.id);
    const archived = await inUserTransaction(pool, request, (client) => archiveAccount(client, id));
    requireRow(archived ? true : undefined);
    response.status(204).send();
  });
  return router;
}
