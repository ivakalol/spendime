import type pg from 'pg';
import type { TransactionWrite } from './model.js';

export const TRANSACTION_SELECT = `SELECT
  t.id, t.kind, t.method,
  t.source_account_id AS "sourceAccountId",
  t.destination_account_id AS "destinationAccountId",
  t.category_id AS "categoryId", t.asset_id AS "assetId",
  t.liability_id AS "liabilityId", t.recurring_rule_id AS "recurringRuleId",
  t.amount, t.currency,
  to_char(t.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "occurredAt",
  (SELECT CASE WHEN (t.occurred_at AT TIME ZONE (SELECT timezone FROM users WHERE id=t.user_id))::date=bt.occurred_on
      OR t.occurred_at=(bt.occurred_on+time '12:00:00') AT TIME ZONE 'UTC'
      THEN bt.occurred_on::text ELSE NULL END
    FROM bank_transactions bt WHERE bt.ledger_transaction_id=t.id ORDER BY bt.occurred_on LIMIT 1) AS "bankOccurredOn",
  t.description, t.merchant, t.category_locked AS "categoryLocked",
  t.amortization_start AS "amortizationStart",
  t.amortization_end AS "amortizationEnd",
  t.daily_impact AS "dailyImpact",
  t.voided_at AS "voidedAt", t.void_reason AS "voidReason",
  t.created_at AS "createdAt", t.updated_at AS "updatedAt"`;

export interface TransactionFilters {
  limit: number;
  offset: number;
  from: string | undefined;
  to: string | undefined;
  accountId: string | undefined;
  categoryId: string | undefined;
  kind: string | undefined;
  assetId: string | undefined;
  liabilityId: string | undefined;
  includeVoided: boolean;
  sortSql: string;
  directionSql: 'ASC' | 'DESC';
}

export async function listTransactions(client: pg.PoolClient, filters: TransactionFilters) {
  const conditions = ['($1::boolean OR t.voided_at IS NULL)'];
  const values: unknown[] = [filters.includeVoided];
  const add = (sql: string, value: unknown) => {
    values.push(value);
    conditions.push(sql.replace('?', `$${values.length}`));
  };
  if (filters.from) add('t.occurred_at >= ?::timestamptz', filters.from);
  if (filters.to) add('t.occurred_at < ?::timestamptz', filters.to);
  if (filters.accountId) {
    values.push(filters.accountId, filters.accountId);
    conditions.push(
      `(t.source_account_id = $${values.length - 1}::uuid OR t.destination_account_id = $${values.length}::uuid)`,
    );
  }
  if (filters.categoryId) add('t.category_id = ?::uuid', filters.categoryId);
  if (filters.kind) add('t.kind = ?::transaction_kind', filters.kind);
  if (filters.assetId) add('t.asset_id = ?::uuid', filters.assetId);
  if (filters.liabilityId) add('t.liability_id = ?::uuid', filters.liabilityId);
  values.push(filters.limit, filters.offset);
  const result = await client.query(
    `${TRANSACTION_SELECT}, count(*) OVER()::integer AS "totalCount"
     FROM transactions t WHERE ${conditions.join(' AND ')}
     ORDER BY ${filters.sortSql} ${filters.directionSql}, t.id ${filters.directionSql}
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
  const total = result.rows[0]?.totalCount ?? 0;
  return { items: result.rows.map(({ totalCount: _, ...row }) => row), total };
}

export async function getTransaction(client: pg.PoolClient, id: string): Promise<any | undefined> {
  return (await client.query(`${TRANSACTION_SELECT} FROM transactions t WHERE t.id = $1`, [id])).rows[0];
}

export async function insertTransaction(
  client: pg.PoolClient, userId: string, input: TransactionWrite,
): Promise<any> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO transactions (
       user_id, kind, method, source_account_id, destination_account_id,
       category_id, asset_id, liability_id, recurring_rule_id, amount, currency,
       occurred_at, description, merchant, amortization_start, amortization_end
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
     ) RETURNING id`,
    [
      userId, input.kind, input.method, input.sourceAccountId, input.destinationAccountId,
      input.categoryId, input.assetId, input.liabilityId, input.recurringRuleId,
      input.amount, input.currency, input.occurredAt, input.description, input.merchant,
      input.amortizationStart, input.amortizationEnd,
    ],
  );
  return getTransaction(client, result.rows[0]!.id);
}

export async function updateTransaction(
  client: pg.PoolClient, id: string, input: TransactionWrite,
): Promise<any | undefined> {
  const result = await client.query<{ id: string }>(
    `UPDATE transactions SET
       method = $2, source_account_id = $3, destination_account_id = $4,
       category_id = $5, asset_id = $6, liability_id = $7, recurring_rule_id = $8,
       amount = $9, currency = $10, occurred_at = $11, description = $12,
       merchant = $13, amortization_start = $14, amortization_end = $15
     WHERE id = $1 AND voided_at IS NULL RETURNING id`,
    [
      id, input.method, input.sourceAccountId, input.destinationAccountId,
      input.categoryId, input.assetId, input.liabilityId, input.recurringRuleId,
      input.amount, input.currency, input.occurredAt, input.description, input.merchant,
      input.amortizationStart, input.amortizationEnd,
    ],
  );
  return result.rows[0] ? getTransaction(client, id) : undefined;
}

export async function voidTransaction(
  client: pg.PoolClient, id: string, reason: string | null,
): Promise<boolean> {
  const result = await client.query(
    `UPDATE transactions SET voided_at = now(), void_reason = $2
     WHERE id = $1 AND voided_at IS NULL`,
    [id, reason],
  );
  if (result.rowCount === 1) {
    await client.query(
      'UPDATE asset_contributions SET voided_at = now() WHERE transaction_id = $1 AND voided_at IS NULL',
      [id],
    );
  }
  return result.rowCount === 1;
}
