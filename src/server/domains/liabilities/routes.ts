import { Router } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import { translateDatabaseError } from '../../db/errors.js';
import { ApiError } from '../../errors.js';
import { requireAuthentication } from '../../middleware/authenticate.js';
import { inUserTransaction, pickFields, requireRow } from '../../routes/helpers.js';
import { booleanQuerySchema, currencySchema, dateSchema, nonnegativeMoneySchema, uuidSchema } from '../../validation/common.js';
import {
  cancelLiability, createLiability, getLiability, listLiabilities,
  updateLiability, type LiabilityWrite,
} from './repository.js';

const rateSchema = z.string().regex(/^\d{1,3}(?:\.\d{1,6})?$/);
const liabilitySchema = z.object({
  name: z.string().trim().min(1).max(120),
  lender: z.string().trim().max(120).nullable().optional().default(null),
  currency: currencySchema,
  originalPrincipal: nonnegativeMoneySchema,
  outstandingBalance: nonnegativeMoneySchema,
  annualInterestRate: rateSchema.default('0'),
  openedOn: dateSchema,
  dueOn: dateSchema.nullable().optional().default(null),
  status: z.enum(['active', 'paid', 'defaulted', 'cancelled']).default('active'),
  notes: z.string().trim().max(5_000).nullable().optional().default(null),
}).strict().superRefine((value, context) => {
  if (value.dueOn && value.dueOn < value.openedOn) {
    context.addIssue({ code: 'custom', path: ['dueOn'], message: 'dueOn cannot precede openedOn.' });
  }
});

export function createLiabilitiesRouter(pool: pg.Pool): Router {
  const router = Router();
  router.use(requireAuthentication(pool));
  router.get('/', async (request, response) => {
    const data = await inUserTransaction(pool, request, (client) =>
      listLiabilities(client, booleanQuerySchema.parse(request.query.includeClosed)));
    response.json({ data });
  });
  router.get('/:id', async (request, response) => {
    const id = uuidSchema.parse(request.params.id);
    const data = await inUserTransaction(pool, request, async (client) =>
      requireRow(await getLiability(client, id)));
    response.json({ data });
  });
  router.post('/', async (request, response) => {
    const input = liabilitySchema.parse(request.body) as LiabilityWrite;
    try {
      const data = await inUserTransaction(pool, request, (client, userId) =>
        createLiability(client, userId, input));
      response.status(201).json({ data });
    } catch (error) { translateDatabaseError(error); }
  });
  router.patch('/:id', async (request, response) => {
    const id = uuidSchema.parse(request.params.id);
    try {
      const data = await inUserTransaction(pool, request, async (client) => {
        const current = requireRow(await getLiability(client, id));
        const input = liabilitySchema.parse({
          ...pickFields(current,[
            'name','lender','currency','originalPrincipal','outstandingBalance',
            'annualInterestRate','openedOn','dueOn','status','notes',
          ]),...request.body,
        }) as LiabilityWrite;
        if (input.currency !== current.currency) {
          throw new ApiError(409, 'currency_immutable', 'Liability currency cannot be changed.');
        }
        return requireRow(await updateLiability(client, id, input));
      });
      response.json({ data });
    } catch (error) { translateDatabaseError(error); }
  });
  router.delete('/:id', async (request, response) => {
    const id = uuidSchema.parse(request.params.id);
    const success = await inUserTransaction(pool, request, (client) => cancelLiability(client, id));
    requireRow(success ? true : undefined);
    response.status(204).send();
  });
  return router;
}
