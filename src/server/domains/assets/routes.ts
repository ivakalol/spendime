import { Router } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import { translateDatabaseError } from '../../db/errors.js';
import { ApiError } from '../../errors.js';
import { requireAuthentication } from '../../middleware/authenticate.js';
import { inUserTransaction, pickFields, requireRow } from '../../routes/helpers.js';
import {
  booleanQuerySchema, currencySchema, dateSchema, nonnegativeMoneySchema, paginationSchema,
  positiveMoneySchema, timestampSchema, uuidSchema,
} from '../../validation/common.js';
import { createTransaction } from '../transactions/service.js';
import type { TransactionWrite } from '../transactions/model.js';
import {
  archiveAsset, createAsset, getAsset, listAssets, listContributions,
  listValuations, updateAsset, type AssetWrite,
} from './repository.js';

const assetShape = {
  name: z.string().trim().min(1).max(120),
  classification: z.enum(['depreciating', 'appreciating', 'custom']),
  currency: currencySchema,
  acquisitionDate: dateSchema,
  currentValue: nonnegativeMoneySchema,
  depreciation: z.enum(['none', 'straight_line']).default('none'),
  usefulLifeDays: z.number().int().positive().nullable().optional().default(null),
  residualValue: nonnegativeMoneySchema.nullable().optional().default(null),
  notes: z.string().trim().max(5_000).nullable().optional().default(null),
};
const validateDepreciation = (
  value: { depreciation: string; usefulLifeDays: number | null },
  context: z.RefinementCtx,
) => {
  if ((value.depreciation === 'straight_line') !== (value.usefulLifeDays !== null)) {
    context.addIssue({
      code: 'custom', path: ['usefulLifeDays'],
      message: 'Straight-line depreciation requires usefulLifeDays; other methods must omit it.',
    });
  }
};
const assetBaseSchema = z.object(assetShape).strict().superRefine(validateDepreciation);

const createAssetSchema = z.object({
  ...assetShape,
  initialContribution: positiveMoneySchema,
}).strict().superRefine(validateDepreciation);

const contributionSchema = z.object({
  amount: positiveMoneySchema,
  currency: currencySchema,
  contributedAt: timestampSchema,
  note: z.string().trim().max(2_000).nullable().optional().default(null),
  sourceAccountId: uuidSchema.nullable().optional().default(null),
  currentValue: nonnegativeMoneySchema.optional(),
}).strict();

const valuationSchema = z.object({
  value: nonnegativeMoneySchema,
  valuedAt: timestampSchema.optional(),
  note: z.string().trim().max(2_000).nullable().optional().default(null),
  setAsCurrent: z.boolean().default(true),
}).strict().superRefine((value, context) => {
  if (!value.setAsCurrent && !value.valuedAt) {
    context.addIssue({ code: 'custom', path: ['valuedAt'], message: 'Historical valuations require valuedAt.' });
  }
  if (value.valuedAt && Date.parse(value.valuedAt) > Date.now() + 5 * 60_000) {
    context.addIssue({ code: 'custom', path: ['valuedAt'], message: 'valuedAt cannot be in the future.' });
  }
});

export function createAssetsRouter(pool: pg.Pool): Router {
  const router = Router();
  router.use(requireAuthentication(pool));
  router.get('/', async (request, response) => {
    const classification = z.enum(['depreciating', 'appreciating', 'custom']).optional()
      .parse(request.query.classification);
    const data = await inUserTransaction(pool, request, (client) => listAssets(
      client, booleanQuerySchema.parse(request.query.includeArchived), classification));
    response.json({ data });
  });
  router.get('/:id', async (request, response) => {
    const id = uuidSchema.parse(request.params.id);
    const data = await inUserTransaction(pool, request, async (client) =>
      requireRow(await getAsset(client, id)));
    response.json({ data });
  });
  router.post('/', async (request, response) => {
    const input = createAssetSchema.parse(request.body);
    try {
      const data = await inUserTransaction(pool, request, (client, userId) =>
        createAsset(client, userId, input));
      response.status(201).json({ data });
    } catch (error) { translateDatabaseError(error); }
  });
  router.patch('/:id', async (request, response) => {
    const id = uuidSchema.parse(request.params.id);
    try {
      const data = await inUserTransaction(pool, request, async (client) => {
        const current = requireRow(await getAsset(client, id));
        if ('cumulativePrincipal' in request.body || 'initialContribution' in request.body) {
          throw new ApiError(400, 'principal_read_only', 'Use the contributions endpoint to change principal.');
        }
        const input = assetBaseSchema.parse({
          ...pickFields(current,[
            'name','classification','currency','acquisitionDate','currentValue','depreciation',
            'usefulLifeDays','residualValue','notes',
          ]),...request.body,
        }) as AssetWrite;
        if (input.currency !== current.currency) {
          throw new ApiError(409, 'currency_immutable', 'Asset currency cannot be changed.');
        }
        return requireRow(await updateAsset(client, id, input));
      });
      response.json({ data });
    } catch (error) { translateDatabaseError(error); }
  });
  router.delete('/:id', async (request, response) => {
    const id = uuidSchema.parse(request.params.id);
    const success = await inUserTransaction(pool, request, (client) => archiveAsset(client, id));
    requireRow(success ? true : undefined);
    response.status(204).send();
  });

  router.get('/:id/contributions', async (request, response) => {
    const id = uuidSchema.parse(request.params.id);
    const page = paginationSchema.parse(request.query);
    const result = await inUserTransaction(pool, request, async (client) => {
      requireRow(await getAsset(client, id));
      return listContributions(client, id, page.limit, page.offset);
    });
    response.json({ data: result.items, meta: { ...page, total: result.total } });
  });
  router.post('/:id/contributions', async (request, response) => {
    const id = uuidSchema.parse(request.params.id);
    const input = contributionSchema.parse(request.body);
    try {
      const data = await inUserTransaction(pool, request, async (client, userId) => {
        const asset = requireRow(await getAsset(client, id));
        if (asset.isArchived || asset.currency !== input.currency) {
          throw new ApiError(409, 'asset_unavailable', 'The asset is archived or uses another currency.');
        }
        let contribution;
        if (input.sourceAccountId) {
          const transaction = await createTransaction(client, userId, {
            kind: 'asset_purchase', method: 'standard',
            sourceAccountId: input.sourceAccountId, destinationAccountId: null,
            categoryId: null, assetId: id, liabilityId: null, recurringRuleId: null,
            amount: input.amount, currency: input.currency, occurredAt: input.contributedAt,
            description: input.note, merchant: null,
            amortizationStart: null, amortizationEnd: null,
          } satisfies TransactionWrite);
          contribution = (await client.query(
            `SELECT id, asset_id AS "assetId", transaction_id AS "transactionId",
               amount, currency, contributed_at AS "contributedAt", note, created_at AS "createdAt"
             FROM asset_contributions WHERE transaction_id=$1`, [transaction.id])).rows[0];
        } else {
          contribution = (await client.query(
            `INSERT INTO asset_contributions
              (user_id, asset_id, amount, currency, contributed_at, note)
             VALUES ($1,$2,$3,$4,$5,$6)
             RETURNING id, asset_id AS "assetId", transaction_id AS "transactionId",
               amount, currency, contributed_at AS "contributedAt", note, created_at AS "createdAt"`,
            [userId, id, input.amount, input.currency, input.contributedAt, input.note])).rows[0];
        }
        if (input.currentValue !== undefined) {
          await client.query('UPDATE assets SET current_value=$2 WHERE id=$1', [id, input.currentValue]);
        }
        return { contribution, asset: await getAsset(client, id) };
      });
      response.status(201).json({ data });
    } catch (error) { translateDatabaseError(error); }
  });

  router.get('/:id/valuations', async (request, response) => {
    const id = uuidSchema.parse(request.params.id);
    const page = paginationSchema.parse(request.query);
    const result = await inUserTransaction(pool, request, async (client) => {
      requireRow(await getAsset(client, id));
      return listValuations(client, id, page.limit, page.offset);
    });
    response.json({ data: result.items, meta: { ...page, total: result.total } });
  });
  router.post('/:id/valuations', async (request, response) => {
    const id = uuidSchema.parse(request.params.id);
    const input = valuationSchema.parse(request.body);
    const data = await inUserTransaction(pool, request, async (client) => {
      requireRow(await getAsset(client, id));
      if (input.setAsCurrent) {
        const updated = await client.query(
          'UPDATE assets SET current_value=$2 WHERE id=$1 AND NOT is_archived AND current_value IS DISTINCT FROM $2',
          [id, input.value],
        );
        if (updated.rowCount === 0) {
          const asset = requireRow(await getAsset(client, id));
          if (asset.isArchived) throw new ApiError(409, 'asset_archived', 'Archived assets cannot be valued.');
          await client.query(
            `INSERT INTO asset_valuations (user_id,asset_id,value,valued_at,note)
             VALUES (app.current_user_id(),$1,$2,now(),$3)`,
            [id,input.value,input.note],
          );
        } else if (input.note) {
          await client.query(
            `UPDATE asset_valuations SET note=$2 WHERE id=(
               SELECT id FROM asset_valuations WHERE asset_id=$1 ORDER BY valued_at DESC,id DESC LIMIT 1
             )`,[id,input.note]);
        }
        return (await listValuations(client,id,1,0)).items[0];
      }
      return (await client.query(
        `INSERT INTO asset_valuations (user_id, asset_id, value, valued_at, note)
         VALUES (app.current_user_id(),$1,$2,$3,$4)
         RETURNING id, asset_id AS "assetId", value, valued_at AS "valuedAt", note, created_at AS "createdAt"`,
        [id, input.value, input.valuedAt, input.note],
      )).rows[0];
    });
    response.status(201).json({ data });
  });
  return router;
}
