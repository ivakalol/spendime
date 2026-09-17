import type pg from 'pg';

const ACCOUNT_SELECT = `
  SELECT a.id, a.name, a.kind, a.currency,
    a.opening_balance AS "openingBalance",
    b.current_balance AS "currentBalance",
    a.institution, a.color, a.icon,
    a.is_archived AS "isArchived",
    a.created_at AS "createdAt", a.updated_at AS "updatedAt"
  FROM accounts a
  JOIN account_balances b ON b.account_id = a.id AND b.user_id = a.user_id
`;

export interface AccountWrite {
  name: string;
  kind: string;
  currency: string;
  openingBalance: string;
  institution: string | null;
  color: string | null;
  icon: string | null;
}

export async function listAccounts(
  client: pg.PoolClient,
  includeArchived: boolean,
): Promise<unknown[]> {
  const result = await client.query(
    `${ACCOUNT_SELECT}
     WHERE ($1::boolean OR NOT a.is_archived)
     ORDER BY a.is_archived, a.name`,
    [includeArchived],
  );
  return result.rows;
}

export async function getAccount(client: pg.PoolClient, id: string): Promise<any | undefined> {
  const result = await client.query(`${ACCOUNT_SELECT} WHERE a.id = $1`, [id]);
  return result.rows[0];
}

export async function createAccount(
  client: pg.PoolClient,
  userId: string,
  input: AccountWrite,
): Promise<any> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO accounts
      (user_id, name, kind, currency, opening_balance, institution, color, icon)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      userId, input.name, input.kind, input.currency, input.openingBalance,
      input.institution, input.color, input.icon,
    ],
  );
  return getAccount(client, result.rows[0]!.id);
}

export async function updateAccount(
  client: pg.PoolClient,
  id: string,
  input: AccountWrite,
): Promise<any | undefined> {
  const result = await client.query<{ id: string }>(
    `UPDATE accounts SET name = $2, kind = $3, currency = $4,
       opening_balance = $5, institution = $6, color = $7, icon = $8
     WHERE id = $1 AND NOT is_archived RETURNING id`,
    [
      id, input.name, input.kind, input.currency, input.openingBalance,
      input.institution, input.color, input.icon,
    ],
  );
  return result.rows[0] ? getAccount(client, id) : undefined;
}

export async function archiveAccount(client: pg.PoolClient, id: string): Promise<boolean> {
  const result = await client.query(
    'UPDATE accounts SET is_archived = true WHERE id = $1 AND NOT is_archived',
    [id],
  );
  return result.rowCount === 1;
}
