import type pg from 'pg';
import { ApiError } from '../../errors.js';
import type { TransactionWrite } from './model.js';
import { getTransaction, insertTransaction, updateTransaction } from './repository.js';

async function validateReferences(
  client: pg.PoolClient,
  input: TransactionWrite,
  current?: TransactionWrite,
): Promise<void> {
  const accountIds = [...new Set([input.sourceAccountId, input.destinationAccountId].filter(Boolean))];
  if (accountIds.length) {
    const accounts = await client.query<{ id: string; currency: string; is_archived: boolean }>(
      'SELECT id, currency, is_archived FROM accounts WHERE id = ANY($1::uuid[])',
      [accountIds],
    );
    const existingAccountIds = new Set(
      [current?.sourceAccountId, current?.destinationAccountId].filter(Boolean),
    );
    if (accounts.rowCount !== accountIds.length ||
        accounts.rows.some((row) =>
          row.currency !== input.currency || (row.is_archived && !existingAccountIds.has(row.id)))) {
      throw new ApiError(404, 'related_resource_not_found', 'A related resource was not found.');
    }
  }
  if (input.categoryId) {
    const result = await client.query<{ kind: string; is_archived: boolean }>(
      'SELECT kind, is_archived FROM categories WHERE id = $1', [input.categoryId]);
    const category = result.rows[0];
    const expected = input.kind === 'income' ? 'income' : input.kind === 'expense' ? 'expense' : null;
    if (!category || (category.is_archived && input.categoryId !== current?.categoryId) ||
        (expected && ![expected, 'both'].includes(category.kind))) {
      throw new ApiError(404, 'related_resource_not_found', 'A related resource was not found.');
    }
  }
  if (input.assetId) {
    const result = await client.query<{currency:string;is_archived:boolean}>(
      'SELECT currency,is_archived FROM assets WHERE id=$1',[input.assetId]);
    const asset=result.rows[0];
    if(!asset||(asset.is_archived&&input.assetId!==current?.assetId)||asset.currency!==input.currency)
      throw new ApiError(404,'related_resource_not_found','A related resource was not found.');
  }
  if (input.liabilityId) {
    const result = await client.query<{currency:string;status:string}>(
      'SELECT currency,status FROM liabilities WHERE id=$1',[input.liabilityId]);
    const liability=result.rows[0];
    if(!liability||(liability.status==='cancelled'&&input.liabilityId!==current?.liabilityId)||liability.currency!==input.currency)
      throw new ApiError(404,'related_resource_not_found','A related resource was not found.');
  }
  if (input.recurringRuleId) {
    const result=await client.query('SELECT id FROM recurring_rules WHERE id=$1 AND is_active',[input.recurringRuleId]);
    if(!result.rows[0]&&input.recurringRuleId!==current?.recurringRuleId)
      throw new ApiError(404,'related_resource_not_found','A related resource was not found.');
  }
}

export async function createTransaction(
  client: pg.PoolClient, userId: string, input: TransactionWrite,
): Promise<any> {
  await validateReferences(client, input);
  const transaction = await insertTransaction(client, userId, input);
  if (input.kind === 'asset_purchase') {
    await client.query(
      `INSERT INTO asset_contributions
        (user_id, asset_id, transaction_id, amount, currency, contributed_at, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, input.assetId, transaction.id, input.amount, input.currency,
        input.occurredAt, input.description],
    );
    return getTransaction(client, transaction.id);
  }
  return transaction;
}

export async function editTransaction(
  client: pg.PoolClient, id: string, input: TransactionWrite,
): Promise<any | undefined> {
  const current = await getTransaction(client, id);
  if (!current) return undefined;
  if (current.voidedAt) throw new ApiError(409, 'transaction_voided', 'A voided transaction cannot be edited.');
  if (current.kind !== input.kind) {
    throw new ApiError(409, 'immutable_transaction_kind', 'Transaction kind cannot be changed.');
  }
  if (current.kind === 'asset_purchase' && current.assetId !== input.assetId) {
    throw new ApiError(409, 'immutable_asset_reference', 'The purchased asset cannot be changed.');
  }
  await validateReferences(client, input, current);
  const updated = await updateTransaction(client, id, input);
  if (input.kind === 'asset_purchase') {
    await client.query(
      `UPDATE asset_contributions SET amount = $2, currency = $3,
         contributed_at = $4, note = $5
       WHERE transaction_id = $1 AND voided_at IS NULL`,
      [id, input.amount, input.currency, input.occurredAt, input.description],
    );
  }
  return updated ? getTransaction(client, id) : undefined;
}
