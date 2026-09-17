import { Router } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import { translateDatabaseError } from '../../db/errors.js';
import { ApiError } from '../../errors.js';
import { requireAuthentication } from '../../middleware/authenticate.js';
import { inUserTransaction, pickFields, requireRow } from '../../routes/helpers.js';
import {
  currencySchema, dateSchema, paginationSchema, positiveMoneySchema,
  timestampSchema, uuidSchema,
} from '../../validation/common.js';
import type { TransactionWrite } from './model.js';
import { getTransaction, listTransactions, voidTransaction } from './repository.js';
import { createTransaction, editTransaction } from './service.js';

const nullableId = uuidSchema.nullable().optional().default(null);
const transactionSchema = z.object({
  kind: z.enum([
    'expense', 'income', 'transfer', 'asset_purchase', 'asset_sale',
    'liability_drawdown', 'liability_payment', 'adjustment',
  ]),
  method: z.enum(['standard', 'amortized', 'recurring']).default('standard'),
  sourceAccountId: nullableId,
  destinationAccountId: nullableId,
  categoryId: nullableId,
  assetId: nullableId,
  liabilityId: nullableId,
  recurringRuleId: nullableId,
  amount: positiveMoneySchema,
  currency: currencySchema,
  occurredAt: timestampSchema,
  description: z.string().trim().max(2_000).nullable().optional().default(null),
  merchant: z.string().trim().max(120).nullable().optional().default(null),
  amortizationStart: dateSchema.nullable().optional().default(null),
  amortizationEnd: dateSchema.nullable().optional().default(null),
}).strict().superRefine((value, context) => {
  const fail = (message: string, path: string) => context.addIssue({
    code: 'custom', message, path: [path],
  });
  if (value.method === 'amortized') {
    if (value.kind !== 'expense') fail('Only expenses can be amortized.', 'method');
    if (!value.amortizationStart || !value.amortizationEnd ||
        value.amortizationEnd < value.amortizationStart) {
      fail('Amortization requires a valid inclusive date range.', 'amortizationEnd');
    }
  } else if (value.amortizationStart || value.amortizationEnd) {
    fail('Amortization dates are only allowed for amortized transactions.', 'amortizationStart');
  }
  if ((value.method === 'recurring') !== Boolean(value.recurringRuleId)) {
    fail('Recurring transactions require exactly one recurring rule.', 'recurringRuleId');
  }
  const source = Boolean(value.sourceAccountId);
  const destination = Boolean(value.destinationAccountId);
  const validAccounts =
    (value.kind === 'expense' && source && !destination) ||
    (value.kind === 'income' && !source && destination) ||
    (value.kind === 'transfer' && source && destination &&
      value.sourceAccountId !== value.destinationAccountId) ||
    (value.kind === 'asset_purchase' && source && !destination && Boolean(value.assetId)) ||
    (value.kind === 'asset_sale' && !source && destination && Boolean(value.assetId)) ||
    (value.kind === 'liability_drawdown' && destination && Boolean(value.liabilityId)) ||
    (value.kind === 'liability_payment' && source && Boolean(value.liabilityId)) ||
    (value.kind === 'adjustment' && source !== destination);
  if (!validAccounts) fail('Account references do not match the transaction kind.', 'kind');
});

const listSchema = paginationSchema.extend({
  from: timestampSchema.optional(),
  to: timestampSchema.optional(),
  accountId: uuidSchema.optional(),
  categoryId: uuidSchema.optional(),
  kind: z.enum([
    'expense', 'income', 'transfer', 'asset_purchase', 'asset_sale',
    'liability_drawdown', 'liability_payment', 'adjustment',
  ]).optional(),
  assetId: uuidSchema.optional(),
  liabilityId: uuidSchema.optional(),
  includeVoided: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
  sort: z.enum(['occurredAt', 'amount', 'createdAt']).default('occurredAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
});

const sortColumns = {
  occurredAt: 't.occurred_at', amount: 't.amount', createdAt: 't.created_at',
} as const;

export function createTransactionsRouter(pool: pg.Pool): Router {
  const router = Router();
  router.use(requireAuthentication(pool));
  router.get('/', async (request, response) => {
    const query = listSchema.parse(request.query);
    if (query.from && query.to && Date.parse(query.from) >= Date.parse(query.to)) {
      throw new ApiError(400, 'invalid_date_range', '`from` must be earlier than `to`.');
    }
    const result = await inUserTransaction(pool, request, (client) => listTransactions(client, {
      limit: query.limit, offset: query.offset, from: query.from, to: query.to,
      accountId: query.accountId, categoryId: query.categoryId, kind: query.kind,
      assetId: query.assetId, liabilityId: query.liabilityId,
      includeVoided: query.includeVoided,
      sortSql: sortColumns[query.sort],
      directionSql: query.direction === 'asc' ? 'ASC' : 'DESC',
    }));
    response.json({ data: result.items, meta: { limit: query.limit, offset: query.offset, total: result.total } });
  });
  router.get('/:id', async (request, response) => {
    const id = uuidSchema.parse(request.params.id);
    const data = await inUserTransaction(pool, request, async (client) =>
      requireRow(await getTransaction(client, id)));
    response.json({ data });
  });
  router.post('/', async (request, response) => {
    const input = transactionSchema.parse(request.body) as TransactionWrite;
    try {
      const data = await inUserTransaction(pool, request, (client, userId) =>
        createTransaction(client, userId, input));
      response.status(201).json({ data });
    } catch (error) { translateDatabaseError(error); }
  });
  router.patch('/:id', async (request, response) => {
    const id = uuidSchema.parse(request.params.id);
    try {
      const data = await inUserTransaction(pool, request, async (client) => {
        const current = requireRow(await getTransaction(client, id));
        const input = transactionSchema.parse({
          ...pickFields(current,[
            'kind','method','sourceAccountId','destinationAccountId','categoryId','assetId',
            'liabilityId','recurringRuleId','amount','currency','occurredAt','description',
            'merchant','amortizationStart','amortizationEnd',
          ]),...request.body,
        }) as TransactionWrite;
        return requireRow(await editTransaction(client, id, input));
      });
      response.json({ data });
    } catch (error) { translateDatabaseError(error); }
  });
  router.delete('/:id', async (request, response) => {
    const id = uuidSchema.parse(request.params.id);
    const reason = z.string().trim().max(250).optional().parse(request.query.reason) ?? null;
    const success = await inUserTransaction(pool, request, (client) => voidTransaction(client, id, reason));
    requireRow(success ? true : undefined);
    response.status(204).send();
  });
  return router;
}
