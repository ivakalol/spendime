import type pg from 'pg';

const SELECT = `SELECT id, name, lender, currency,
  original_principal AS "originalPrincipal",
  outstanding_balance AS "outstandingBalance",
  annual_interest_rate AS "annualInterestRate",
  opened_on::text AS "openedOn", due_on::text AS "dueOn", status, notes,
  created_at AS "createdAt", updated_at AS "updatedAt" FROM liabilities`;

export interface LiabilityWrite {
  name: string; lender: string | null; currency: string;
  originalPrincipal: string; outstandingBalance: string; annualInterestRate: string;
  openedOn: string; dueOn: string | null;
  status: 'active' | 'paid' | 'defaulted' | 'cancelled'; notes: string | null;
}

export async function listLiabilities(client: pg.PoolClient, includeClosed: boolean) {
  return (await client.query(
    `${SELECT} WHERE ($1::boolean OR status='active') ORDER BY status, due_on NULLS LAST, name`,
    [includeClosed],
  )).rows;
}
export async function getLiability(client: pg.PoolClient, id: string): Promise<any | undefined> {
  return (await client.query(`${SELECT} WHERE id=$1`, [id])).rows[0];
}
export async function createLiability(
  client: pg.PoolClient, userId: string, input: LiabilityWrite,
) {
  const result = await client.query<{ id: string }>(
    `INSERT INTO liabilities
      (user_id,name,lender,currency,original_principal,outstanding_balance,
       annual_interest_rate,opened_on,due_on,status,notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [userId,input.name,input.lender,input.currency,input.originalPrincipal,
      input.outstandingBalance,input.annualInterestRate,input.openedOn,input.dueOn,
      input.status,input.notes],
  );
  return getLiability(client, result.rows[0]!.id);
}
export async function updateLiability(client: pg.PoolClient, id: string, input: LiabilityWrite) {
  const result = await client.query<{ id: string }>(
    `UPDATE liabilities SET name=$2,lender=$3,currency=$4,original_principal=$5,
       outstanding_balance=$6,annual_interest_rate=$7,opened_on=$8,due_on=$9,
       status=$10,notes=$11 WHERE id=$1 AND status <> 'cancelled' RETURNING id`,
    [id,input.name,input.lender,input.currency,input.originalPrincipal,
      input.outstandingBalance,input.annualInterestRate,input.openedOn,input.dueOn,
      input.status,input.notes],
  );
  return result.rows[0] ? getLiability(client, id) : undefined;
}
export async function cancelLiability(client: pg.PoolClient, id: string): Promise<boolean> {
  const result = await client.query(
    `UPDATE liabilities SET status='cancelled' WHERE id=$1 AND status <> 'cancelled'`, [id]);
  return result.rowCount === 1;
}
