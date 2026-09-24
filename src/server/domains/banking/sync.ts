import { createHash } from 'node:crypto';
import type pg from 'pg';
import { withUserTransaction } from '../../db/transactions.js';
import { voidTransaction } from '../transactions/repository.js';
import type { BankingProvider, BankTransaction } from './provider.js';
import { BankingProviderError } from './provider.js';
import type { BankingSecrets } from './secrets.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const amount = (value: string) => {
  const normalized = value.replace(/^-/, '');
  return /^\d{1,15}(\.\d{1,4})?$/.test(normalized) && Number(normalized) > 0 ? normalized : null;
};
const signedBalance = (value: string) => /^-?\d{1,15}(\.\d{1,4})?$/.test(value) ? value : null;
const DEFAULT_SYNC_INTERVAL_MINUTES = 360;

export function effectiveSyncIntervalMinutes(
  provider: Pick<BankingProvider, 'id' | 'environment'>,
  connection: { environment: string; institutionName: string },
  configuredMinutes = DEFAULT_SYNC_INTERVAL_MINUTES,
): number {
  return provider.id === 'enable_banking' && provider.environment === 'sandbox' &&
    connection.environment === 'sandbox' && connection.institutionName === 'Mock ASPSP' &&
    Number.isInteger(configuredMinutes) && configuredMinutes >= 5 && configuredMinutes <= 360
    ? configuredMinutes : DEFAULT_SYNC_INTERVAL_MINUTES;
}

interface Link { id: string; connection_id: string; provider_account_id: string; account_id: string | null; link_mode: 'new' | 'existing' | null; currency: string; last_synced_at: Date | null }

async function stagePage(pool: pg.Pool, userId: string, link: Link, records: BankTransaction[], ordinals: Map<string, number>): Promise<void> {
  await withUserTransaction(pool, userId, async (client) => {
    await client.query(`UPDATE bank_connections SET sync_lease_until=now()+interval '5 minutes' WHERE id=$1`,[link.connection_id]);
    for (const record of records) {
      const parsedAmount = amount(record.amount);
      if (!parsedAmount) throw new BankingProviderError('invalid_provider_amount');
      const signature = hash(JSON.stringify([record.direction,parsedAmount,record.currency,record.occurredOn,record.merchant,record.description]));
      const ordinal = (ordinals.get(signature) ?? 0) + 1;
      ordinals.set(signature, ordinal);
      const key = record.entryReference ? `ref:${hash(record.entryReference)}` : `fp:${signature}:${ordinal}`;
      const result = await client.query<{ id: string; ledger_transaction_id: string | null; match_status: string }>(`
        INSERT INTO bank_transactions(user_id,bank_account_link_id,identity_key,entry_reference,status,direction,amount,currency,occurred_on,merchant,description,counterparty_hash)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT(bank_account_link_id,identity_key) DO UPDATE SET
          status=CASE WHEN bank_transactions.status='BOOK' AND excluded.status IN ('PDNG','HOLD') THEN 'BOOK' ELSE excluded.status END,
          entry_reference=COALESCE(bank_transactions.entry_reference,excluded.entry_reference),
          match_status=CASE WHEN bank_transactions.ledger_transaction_id IS NOT NULL AND
            (bank_transactions.amount<>excluded.amount OR bank_transactions.currency<>excluded.currency OR
             bank_transactions.occurred_on<>excluded.occurred_on OR bank_transactions.direction<>excluded.direction)
            THEN 'review' ELSE bank_transactions.match_status END,
          amount=CASE WHEN bank_transactions.ledger_transaction_id IS NULL THEN excluded.amount ELSE bank_transactions.amount END,
          currency=CASE WHEN bank_transactions.ledger_transaction_id IS NULL THEN excluded.currency ELSE bank_transactions.currency END,
          occurred_on=CASE WHEN bank_transactions.ledger_transaction_id IS NULL THEN excluded.occurred_on ELSE bank_transactions.occurred_on END,
          direction=CASE WHEN bank_transactions.ledger_transaction_id IS NULL THEN excluded.direction ELSE bank_transactions.direction END,
          merchant=CASE WHEN bank_transactions.ledger_transaction_id IS NULL THEN excluded.merchant ELSE bank_transactions.merchant END,
          description=CASE WHEN bank_transactions.ledger_transaction_id IS NULL THEN excluded.description ELSE bank_transactions.description END,
          proposed_amount=CASE WHEN bank_transactions.ledger_transaction_id IS NOT NULL AND bank_transactions.amount<>excluded.amount THEN excluded.amount ELSE bank_transactions.proposed_amount END,
          proposed_currency=CASE WHEN bank_transactions.ledger_transaction_id IS NOT NULL AND bank_transactions.currency<>excluded.currency THEN excluded.currency ELSE bank_transactions.proposed_currency END,
          proposed_occurred_on=CASE WHEN bank_transactions.ledger_transaction_id IS NOT NULL AND bank_transactions.occurred_on<>excluded.occurred_on THEN excluded.occurred_on ELSE bank_transactions.proposed_occurred_on END,
          proposed_direction=CASE WHEN bank_transactions.ledger_transaction_id IS NOT NULL AND bank_transactions.direction<>excluded.direction THEN excluded.direction ELSE bank_transactions.proposed_direction END,
          proposed_merchant=CASE WHEN bank_transactions.ledger_transaction_id IS NOT NULL AND bank_transactions.merchant IS DISTINCT FROM excluded.merchant THEN excluded.merchant ELSE bank_transactions.proposed_merchant END,
          proposed_description=CASE WHEN bank_transactions.ledger_transaction_id IS NOT NULL AND bank_transactions.description IS DISTINCT FROM excluded.description THEN excluded.description ELSE bank_transactions.proposed_description END
        RETURNING id,ledger_transaction_id,match_status`,
        [userId,link.id,key,record.entryReference,record.status,record.direction,parsedAmount,record.currency,record.occurredOn,record.merchant,record.description,record.counterpartyHash]);
      const staged = result.rows[0]!;
      if (['CNCL','RJCT'].includes(record.status) && staged.ledger_transaction_id) {
        const pair = await client.query(`SELECT id FROM bank_transfer_pairs WHERE debit_bank_transaction_id=$1 OR credit_bank_transaction_id=$1`, [staged.id]);
        if (pair.rowCount) await client.query(`UPDATE bank_transactions SET match_status='review' WHERE id=$1`, [staged.id]);
        else {
          await voidTransaction(client, staged.ledger_transaction_id, 'Bank transaction cancelled or rejected');
          await client.query(`UPDATE bank_transactions SET match_status='ignored' WHERE id=$1`, [staged.id]);
        }
      }
      if (record.status === 'BOOK') {
        await client.query(`UPDATE bank_transactions SET match_status='ignored' WHERE id IN (
          SELECT id FROM bank_transactions WHERE bank_account_link_id=$1 AND status IN ('PDNG','HOLD')
          AND match_status='new' AND direction=$2 AND amount=$3 AND currency=$4
          AND occurred_on BETWEEN $5::date-interval '3 days' AND $5::date+interval '3 days'
          AND lower(coalesce(merchant,''))=lower(coalesce($6,'')) LIMIT 1)`,
        [link.id,record.direction,parsedAmount,record.currency,record.occurredOn,record.merchant]);
      }
    }
  });
}

export async function postStagedTransaction(client: pg.PoolClient, userId: string, bankTransactionId: string): Promise<void> {
  const row = (await client.query<any>(`SELECT bt.*,l.account_id,l.link_mode,l.currency AS account_currency
    FROM bank_transactions bt JOIN bank_account_links l ON l.id=bt.bank_account_link_id
    WHERE bt.id=$1 FOR UPDATE OF bt`, [bankTransactionId])).rows[0];
  if (!row || row.match_status !== 'new' || row.status !== 'BOOK' || !row.account_id) return;
  if (row.currency !== row.account_currency) {
    await client.query(`UPDATE bank_transactions SET match_status='review' WHERE id=$1`, [row.id]);
    return;
  }
  const kind = row.direction === 'debit' ? 'expense' : 'income';
  let refundId: string | null = null;
  const categoryId: string | null = null;
  if (kind === 'income' && row.merchant && /\b(refund|returned|reversal|chargeback)\b|връщане|възстановяване/i.test(row.description ?? '')) {
    const matches = await client.query<{ id: string; category_id: string | null }>(`
      SELECT t.id,t.category_id FROM bank_transactions bt JOIN transactions t ON t.id=bt.ledger_transaction_id
      WHERE bt.bank_account_link_id=$1 AND t.kind='expense' AND t.voided_at IS NULL
        AND t.amount-COALESCE((SELECT sum(r.amount) FROM bank_refund_links rl
          JOIN transactions r ON r.id=rl.refund_transaction_id AND r.voided_at IS NULL
          WHERE rl.original_transaction_id=t.id),0)>=$2::numeric
        AND lower(coalesce(t.merchant,''))=lower($3)
        AND t.occurred_at::date BETWEEN $4::date-interval '90 days' AND $4::date
      LIMIT 2`, [row.bank_account_link_id,row.amount,row.merchant,row.occurred_on]);
    if (matches.rowCount === 1) refundId = matches.rows[0]!.id;
  }
  const actualKind = refundId ? 'refund' : kind;
  const result = await client.query<{ id: string }>(`
    INSERT INTO transactions(user_id,kind,method,source_account_id,destination_account_id,
      category_id,amount,currency,occurred_at,description,merchant)
    VALUES($1,$2,'standard',$3,$4,$5,$6,$7,
      ($8::date + time '12:00:00') AT TIME ZONE (SELECT timezone FROM users WHERE id=$1),$9,$10) RETURNING id`,
    [userId,actualKind,row.direction==='debit'?row.account_id:null,row.direction==='credit'?row.account_id:null,
      categoryId,row.amount,row.currency,row.occurred_on,row.description,row.merchant]);
  const ledgerId = result.rows[0]!.id;
  if (refundId) await client.query(`INSERT INTO bank_refund_links(refund_transaction_id,user_id,original_transaction_id) VALUES($1,$2,$3)`, [ledgerId,userId,refundId]);
  await client.query(`UPDATE bank_transactions SET ledger_transaction_id=$2,match_status='posted',classification_source=$3 WHERE id=$1`,
    [row.id,ledgerId,refundId?'refund':'uncategorized']);
}

export async function syncConnection(pool: pg.Pool, provider: BankingProvider, secrets: BankingSecrets, userId: string,
  connectionId: string, force = false, sandboxIntervalMinutes = DEFAULT_SYNC_INTERVAL_MINUTES): Promise<boolean> {
  const lockClient = await pool.connect();
  let locked = false;
  try {
  locked = (await lockClient.query<{ locked: boolean }>(
    'SELECT pg_try_advisory_lock(hashtextextended($1::text,0)) AS locked',[connectionId])).rows[0]?.locked ?? false;
  if (!locked) return false;
  const connection = await withUserTransaction(pool,userId,async (client) => {
    const result = await client.query<{ provider_session_id: string; consent_expires_at: Date | null; environment: string; institution_name: string }>(`
      UPDATE bank_connections SET sync_lease_until=now()+interval '5 minutes'
      WHERE id=$1 AND provider=$3 AND environment=$4 AND provider_session_id IS NOT NULL
        AND status='active' AND (sync_lease_until IS NULL OR sync_lease_until<now())
        AND ($2::boolean OR next_sync_at IS NULL OR next_sync_at<=now())
      RETURNING provider_session_id,consent_expires_at,environment,institution_name`,
      [connectionId,force,provider.id,provider.environment]);
    return result.rows[0];
  });
  if (!connection) return false;
  try {
    if (connection.consent_expires_at && connection.consent_expires_at.getTime() <= Date.now()) throw new BankingProviderError('EXPIRED_SESSION');
    if (await provider.sessionStatus(secrets.decrypt(connection.provider_session_id)) !== 'active') throw new BankingProviderError('EXPIRED_SESSION');
    const links = await withUserTransaction(pool,userId,async (client) =>
      (await client.query<Link>(`SELECT id,connection_id,provider_account_id,account_id,link_mode,currency,last_synced_at
      FROM bank_account_links WHERE connection_id=$1 ORDER BY id`, [connectionId])).rows);
    for (const link of links) {
      const balance = await provider.balance(link.provider_account_id);
      if (balance && balance.currency === link.currency && signedBalance(balance.amount) !== null) {
        await withUserTransaction(pool,userId,async (client) => {
          await client.query(`UPDATE bank_account_links SET reported_balance=$2,balance_as_of=coalesce($3::timestamptz,now()) WHERE id=$1`,
            [link.id,balance.amount,balance.asOf]);
        });
      }
      const ordinals = new Map<string,number>();
      let next: string | null = null;
      for (let page=0;page<500;page++) {
        const data: import('./provider.js').BankTransactionPage = await provider.transactions(link.provider_account_id, {
          ...(link.last_synced_at ? { from: new Date(link.last_synced_at.getTime()-7*86400_000).toISOString().slice(0,10) } : {}),
          ...(next ? { next } : {}), initial: !link.last_synced_at,
        });
        await stagePage(pool,userId,link,data.transactions,ordinals);
        next = data.next;
        if (!next) break;
        if (page === 499) throw new BankingProviderError('pagination_limit');
      }
      await withUserTransaction(pool,userId,async (client) => {
        const currentLink = (await client.query<{ account_id:string|null; link_mode:'new'|'existing'|null; automatic_post_after:Date|null }>(
          'SELECT account_id,link_mode,automatic_post_after FROM bank_account_links WHERE id=$1 FOR UPDATE',[link.id])).rows[0];
        if (currentLink?.account_id) {
          const candidates = await client.query<{ id: string; eligible_for_automatic_post:boolean; possible_manual_duplicate:boolean }>(`SELECT bt.id,
            (bt.first_seen_at > l.automatic_post_after AND
             bt.occurred_on > (l.automatic_post_after AT TIME ZONE u.timezone)::date) AS eligible_for_automatic_post,
            EXISTS(SELECT 1 FROM transactions t WHERE t.user_id=bt.user_id AND t.voided_at IS NULL
              AND t.amount=bt.amount AND t.currency=bt.currency
              AND (t.occurred_at AT TIME ZONE u.timezone)::date BETWEEN bt.occurred_on-3 AND bt.occurred_on+3
              AND ((bt.direction='debit' AND t.source_account_id=l.account_id)
                OR (bt.direction='credit' AND t.destination_account_id=l.account_id))
              AND NOT EXISTS(SELECT 1 FROM bank_transactions linked WHERE linked.ledger_transaction_id=t.id)) AS possible_manual_duplicate
            FROM bank_account_links l JOIN users u ON u.id=l.user_id
            JOIN bank_transactions bt ON bt.bank_account_link_id=l.id
            WHERE bt.bank_account_link_id=$1 AND bt.status='BOOK' AND bt.match_status='new'
            ORDER BY bt.occurred_on,CASE bt.direction WHEN 'debit' THEN 0 ELSE 1 END,bt.id`, [link.id]);
          for (const candidate of candidates.rows) {
            if (candidate.possible_manual_duplicate ||
                ((provider.environment === 'production' || currentLink.link_mode === 'existing') &&
                  !candidate.eligible_for_automatic_post))
              await client.query(`UPDATE bank_transactions SET match_status='review' WHERE id=$1`,[candidate.id]);
            else await postStagedTransaction(client,userId,candidate.id);
          }
        }
        await client.query(`UPDATE bank_account_links SET last_synced_at=now() WHERE id=$1`,[link.id]);
      });
    }
    await withUserTransaction(pool,userId,async (client) => {
      await client.query(`UPDATE bank_connections SET last_synced_at=now(),
        next_sync_at=now()+($2::integer*interval '1 minute'),sync_lease_until=NULL,error_code=NULL WHERE id=$1`,
        [connectionId,effectiveSyncIntervalMinutes(provider,
          { environment:connection.environment,institutionName:connection.institution_name },sandboxIntervalMinutes)]);
    });
  } catch (error) {
    const expired = error instanceof BankingProviderError && error.code === 'EXPIRED_SESSION';
    const limited = error instanceof BankingProviderError &&
      (error.code.includes('RATE_LIMIT') || error.code==='http_429' || error.httpStatus===429);
    const retryAfterMs = error instanceof BankingProviderError && error.retryAfterSeconds
      ? error.retryAfterSeconds*1000 : 0;
    await withUserTransaction(pool,userId,async (client) => {
      await client.query(`UPDATE bank_connections SET status=$2,error_code=$3,next_sync_at=$4,
        sync_lease_until=NULL WHERE id=$1`, [connectionId,expired?'expired':'active',expired?'consent_expired':limited?'rate_limited':'sync_failed',
        expired?null:new Date(Date.now()+Math.max((limited?6:1)*3600_000,retryAfterMs))]);
    });
    if (!limited && !expired) throw error;
  }
  return true;
  } finally {
    if (locked) {
      try { await lockClient.query('SELECT pg_advisory_unlock(hashtextextended($1::text,0))',[connectionId]); }
      catch { lockClient.release(true); throw new Error('Could not release bank synchronization lock'); }
    }
    lockClient.release();
  }
}

export async function rescheduleSandboxMockConnections(pool: pg.Pool, provider: BankingProvider,
  sandboxIntervalMinutes: number, ownerUserId: string): Promise<number> {
  const interval = effectiveSyncIntervalMinutes(provider,
    { environment:'sandbox',institutionName:'Mock ASPSP' },sandboxIntervalMinutes);
  if (interval === DEFAULT_SYNC_INTERVAL_MINUTES) return 0;
  return withUserTransaction(pool,ownerUserId,async(client) =>
    (await client.query(`UPDATE bank_connections SET
        next_sync_at=last_synced_at+($1::integer*interval '1 minute')
        WHERE user_id=$3 AND provider=$2 AND environment='sandbox' AND institution_name='Mock ASPSP'
          AND status='active' AND error_code IS NULL AND last_synced_at IS NOT NULL
          AND next_sync_at>last_synced_at+($1::integer*interval '1 minute')`,
      [interval,provider.id,ownerUserId])).rowCount ?? 0);
}

export async function syncDueConnections(pool: pg.Pool, provider: BankingProvider, secrets: BankingSecrets,
  sandboxIntervalMinutes: number, ownerUserId: string): Promise<void> {
  const ids = await withUserTransaction(pool,ownerUserId,async (client) =>
    (await client.query<{ id: string }>(`SELECT id FROM bank_connections WHERE provider=$1 AND environment=$2
      AND user_id=$3 AND status='active' AND next_sync_at<=now()
      AND (sync_lease_until IS NULL OR sync_lease_until<now()) LIMIT 10`,
      [provider.id,provider.environment,ownerUserId])).rows);
  for (const { id } of ids) {
    try { await syncConnection(pool,provider,secrets,ownerUserId,id,false,sandboxIntervalMinutes); } catch (error) {
      console.error('Bank sync failed', { name: error instanceof Error ? error.name : 'UnknownError' });
    }
  }
}
