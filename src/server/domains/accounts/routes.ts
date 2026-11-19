import { Router } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import { translateDatabaseError } from '../../db/errors.js';
import { ApiError } from '../../errors.js';
import { moneyDecimal, moneyUnits } from '../../../shared/moneyMath.js';
import { requireAuthentication } from '../../middleware/authenticate.js';
import { inUserTransaction, pickFields, requireRow } from '../../routes/helpers.js';
import { booleanQuerySchema, currencySchema, signedMoneySchema, uuidSchema } from '../../validation/common.js';
import {
  archiveAccount, createAccount, getAccount, listAccounts, permanentlyDeleteAccount,
  restoreAccount, updateAccount,
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
      const data = await inUserTransaction(pool, request, async (client, userId) => {
        const { currentBalance, expectedCurrentBalance, ...changes } = request.body;
        const balance = z.object({currentBalance:signedMoneySchema.optional(),expectedCurrentBalance:signedMoneySchema.optional()}).parse({currentBalance,expectedCurrentBalance});
        if (balance.currentBalance !== undefined) {
          if (balance.expectedCurrentBalance === undefined) throw new ApiError(400,'balance_snapshot_required','Refresh the account before correcting its balance.');
          // Briefly serialize ledger writers, including bank ingestion, while computing the correction.
          await client.query('LOCK TABLE transactions IN SHARE ROW EXCLUSIVE MODE');
          await client.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE',[id]);
        }
        const current = requireRow(await getAccount(client, id));
        const input = accountSchema.parse({
          ...pickFields(current,['name','kind','currency','openingBalance','institution','color','icon']),
          ...changes,
        }) as AccountWrite;
        if (input.currency !== current.currency) {
          throw new ApiError(409, 'currency_immutable', 'Account currency cannot be changed.');
        }
        if (balance.currentBalance !== undefined) {
          if (current.isArchived) throw new ApiError(409,'account_archived','Restore this account before correcting its balance.');
          if (moneyUnits(current.currentBalance) !== moneyUnits(balance.expectedCurrentBalance!)) throw new ApiError(409,'balance_changed','The balance changed. Close and reopen Manage account, then try again.');
          if (moneyUnits(input.openingBalance) !== moneyUnits(current.openingBalance)) throw new ApiError(400,'opening_balance_conflict','Correct the current balance without changing the opening balance.');
        }
        requireRow(await updateAccount(client, id, input));
        if (balance.currentBalance !== undefined) {
          const difference = moneyUnits(balance.currentBalance)-moneyUnits(current.currentBalance);
          if (difference !== 0n) {
            const category = (await client.query<{id:string}>(`INSERT INTO categories(user_id,name,kind,is_system)
              VALUES($1,'Unrecorded','both',true) ON CONFLICT(user_id,name)
              DO UPDATE SET kind='both',is_archived=false RETURNING id`,[userId])).rows[0]!;
            await client.query(`INSERT INTO transactions(user_id,kind,source_account_id,destination_account_id,category_id,amount,currency,occurred_at,description)
              VALUES($1,$2,$3,$4,$5,$6,$7,now(),'Balance correction · Unrecorded')`,
              [userId,difference<0n?'expense':'income',difference<0n?id:null,difference>0n?id:null,category.id,moneyDecimal(difference<0n?-difference:difference),current.currency]);
          }
        }
        return requireRow(await getAccount(client,id));
      });
      response.json({ data });
    } catch (error) { translateDatabaseError(error); }
  });

  router.post('/:id/restore', async (request, response) => {
    const id = uuidSchema.parse(request.params.id);
    const data = await inUserTransaction(pool, request, async (client) => {
      const current = requireRow(await getAccount(client, id));
      if (!current.isArchived) {
        throw new ApiError(409, 'account_not_archived', 'Only archived accounts can be restored.');
      }
      return requireRow(await restoreAccount(client, id));
    });
    response.json({ data });
  });

  router.delete('/:id/permanent', async (request, response) => {
    const id = uuidSchema.parse(request.params.id);
    await inUserTransaction(pool, request, async (client) => {
      const current = requireRow(await getAccount(client, id));
      if (!current.isArchived) {
        throw new ApiError(409, 'account_not_archived', 'Archive the account before deleting it permanently.');
      }
      if (!await permanentlyDeleteAccount(client, id)) {
        throw new ApiError(
          409,
          'account_has_history',
          'This account cannot be deleted because transactions or recurring rules still reference it.',
        );
      }
    });
    response.status(204).send();
  });

  router.delete('/:id', async (request, response) => {
    const id = uuidSchema.parse(request.params.id);
    const archived = await inUserTransaction(pool, request, (client) => archiveAccount(client, id));
    requireRow(archived ? true : undefined);
    response.status(204).send();
  });
  return router;
}
