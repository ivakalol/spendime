import { createHash } from 'node:crypto';
import type pg from 'pg';
import { withUserTransaction } from '../../db/transactions.js';
import { voidTransaction } from '../transactions/repository.js';
import type { BankingProvider, BankTransaction } from './provider.js';
import { BankingProviderError } from './provider.js';
import type { BankingSecrets } from './secrets.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function normalizeBankAmount(value: string): string | null {
  // Direction comes from the provider's debit/credit indicator. Normalize decimal
  // strings exactly; floating point rounding must never alter imported money.
  const match = /^[+-]?(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return null;
  const whole = match[1]!.replace(/^0+(?=\d)/, '');
  const fraction = (match[2] ?? '').replace(/0+$/, '');
  if (whole.length > 15 || fraction.length > 4) return null;
  if (whole === '0' && !fraction) return '0';
  // Preserve the representation used by existing fallback identity hashes, so
  // already imported entries without bank references cannot become duplicates.
  const legacy = value.replace(/^-/, '');
  if (/^\d{1,15}(\.\d{1,4})?$/.test(legacy)) return legacy;
  return fraction ? `${whole}.${fraction}` : whole;
}
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

interface Link { id: string; connection_id: string; provider_account_id: string; account_id: string | null; link_mode: 'new' | 'existing' | null; currency: string; last_synced_at: Date | null; latest_observed_on: string | null }

export interface BankSyncResult {
  fetched: number;
  booked: number;
  pending: number;
  newBankTransactions: number;
  updatedBankTransactions: number;
  duplicatesSkipped: number;
  ignored: number;
  review: number;
  merged: number;
  created: number;
  unlinked: number;
  accounts: number;
}

const emptySyncResult = (): BankSyncResult => ({ fetched:0,booked:0,pending:0,
  newBankTransactions:0,updatedBankTransactions:0,duplicatesSkipped:0,ignored:0,
  review:0,merged:0,created:0,unlinked:0,accounts:0 });
const traceEnabled = () => process.env.NODE_ENV !== 'production' && process.env.BANKING_TRACE_TRANSACTIONS === '1';
const trace = (stage: string, details: Record<string, unknown>) => {
  if (traceEnabled()) console.info('Bank sync trace', { stage, ...details });
};
const comparableAmount = (value: string) => {
  const [whole,fraction=''] = value.replace(/^\+/,'').split('.');
  return `${whole?.replace(/^0+(?=\d)/,'')}.${fraction.replace(/0+$/,'')}`;
};

// Use the latest transaction date actually seen, never the wall-clock time of
// a successful empty response. The overlap catches delayed bank bookings.
export function bankFetchFrom(latestObservedOn: string | null, overlapDays = 90): string | undefined {
  if (!latestObservedOn) return undefined;
  const date = new Date(`${latestObservedOn}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  date.setUTCDate(date.getUTCDate() - overlapDays);
  return date.toISOString().slice(0,10);
}

async function stagePage(pool: pg.Pool, userId: string, link: Link, records: BankTransaction[], ordinals: Map<string, number>, summary: BankSyncResult): Promise<string[]> {
  return withUserTransaction(pool, userId, async (client) => {
    const pendingSeen: string[] = [];
    await client.query(`UPDATE bank_connections SET sync_lease_until=now()+interval '5 minutes' WHERE id=$1`,[link.connection_id]);
    // Serialize page ingestion with the start-from-today action. A later page
    // or overlapping sync cannot restore deliberately excluded history.
    const cutoff = (await client.query<{ history_ignored_before:string|null }>(
      `SELECT history_ignored_before::text FROM bank_account_links WHERE id=$1 FOR UPDATE`,[link.id])).rows[0]?.history_ignored_before;
    for (const record of records) {
      // Pending rows with a stable entry reference can be represented in the
      // ledger. Without that reference they remain staged until booking.
      let parsedAmount = normalizeBankAmount(record.amount);
      if (parsedAmount === null) throw new BankingProviderError('invalid_provider_amount');
      if (parsedAmount === '0') {
        const existing = record.entryReference ? (await client.query<{ amount: string }>(
          `SELECT amount FROM bank_transactions WHERE bank_account_link_id=$1 AND identity_key=$2`,
          [link.id, `ref:${hash(record.entryReference)}`])).rows[0] : undefined;
        // New zero-value authorizations have no financial effect. A cancellation
        // of an existing movement must still reverse that movement's ledger entry.
        if (!existing) { summary.ignored++; trace('zero_amount',{linkId:link.id,status:record.status}); continue; }
        if (!['CNCL','RJCT'].includes(record.status)) throw new BankingProviderError('invalid_provider_zero_adjustment');
        parsedAmount = existing.amount;
      }
      const signature = hash(JSON.stringify([record.direction,parsedAmount,record.currency,record.occurredOn,record.merchant,record.description]));
      const ordinal = (ordinals.get(signature) ?? 0) + 1;
      ordinals.set(signature, ordinal);
      const key = record.entryReference ? `ref:${hash(record.entryReference)}` : `fp:${signature}:${ordinal}`;
      const before = (await client.query<{ status:string; direction:string; amount:string; currency:string;
        occurred_on:string; merchant:string|null; description:string|null; match_status:string; ledger_transaction_id:string|null }>(`
        SELECT status,direction,amount,currency,occurred_on::text,merchant,description,match_status,ledger_transaction_id
        FROM bank_transactions WHERE bank_account_link_id=$1 AND identity_key=$2 FOR UPDATE`,[link.id,key])).rows[0];
      const result = await client.query<{ id: string; ledger_transaction_id: string | null; match_status: string }>(`
        INSERT INTO bank_transactions(user_id,bank_account_link_id,identity_key,entry_reference,status,direction,amount,currency,occurred_on,merchant,description,counterparty_hash,booking_date,transaction_date,value_date,provider_transaction_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        ON CONFLICT(bank_account_link_id,identity_key) DO UPDATE SET
          status=CASE WHEN bank_transactions.status='BOOK' AND excluded.status IN ('PDNG','HOLD') THEN 'BOOK' ELSE excluded.status END,
          entry_reference=COALESCE(bank_transactions.entry_reference,excluded.entry_reference),
          booking_date=COALESCE(excluded.booking_date,bank_transactions.booking_date),
          transaction_date=COALESCE(excluded.transaction_date,bank_transactions.transaction_date),
          value_date=COALESCE(excluded.value_date,bank_transactions.value_date),
          provider_transaction_id=COALESCE(excluded.provider_transaction_id,bank_transactions.provider_transaction_id),
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
        [userId,link.id,key,record.entryReference,record.status,record.direction,parsedAmount,record.currency,record.occurredOn,record.merchant,record.description,record.counterpartyHash,
          record.bookingDate ?? null,record.transactionDate ?? null,record.valueDate ?? null,record.providerTransactionId ?? null]);
      const staged = result.rows[0]!;
      if (['PDNG','HOLD'].includes(record.status) && record.entryReference) pendingSeen.push(staged.id);
      if (!before) summary.newBankTransactions++;
      else if (before.status !== record.status || before.direction !== record.direction ||
        comparableAmount(before.amount) !== comparableAmount(parsedAmount) || before.currency !== record.currency ||
        before.occurred_on !== record.occurredOn || before.merchant !== record.merchant ||
        before.description !== record.description) summary.updatedBankTransactions++;
      else summary.duplicatesSkipped++;
      trace('staged',{linkId:link.id,bankTransactionId:staged.id,identityKey:key,
        disposition:before?'existing':'new',status:record.status,matchStatus:staged.match_status,
        ledgerTransactionId:staged.ledger_transaction_id});
      if (cutoff && ['BOOK','PDNG','HOLD'].includes(record.status) &&
        record.occurredOn<cutoff && !staged.ledger_transaction_id) {
        await client.query(`UPDATE bank_transactions SET match_status='ignored' WHERE id=$1`,[staged.id]);
        summary.ignored++;
      }
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
    return pendingSeen;
  });
}

export async function postStagedTransaction(client: pg.PoolClient, userId: string, bankTransactionId: string): Promise<boolean> {
  const row = (await client.query<any>(`SELECT bt.*,l.account_id,l.link_mode,l.currency AS account_currency
    FROM bank_transactions bt JOIN bank_account_links l ON l.id=bt.bank_account_link_id
    WHERE bt.id=$1 FOR UPDATE OF bt`, [bankTransactionId])).rows[0];
  if (!row || row.match_status !== 'new' ||
    (row.status !== 'BOOK' && !(['PDNG','HOLD'].includes(row.status) && row.entry_reference)) || !row.account_id) return false;
  if (row.currency !== row.account_currency) {
    await client.query(`UPDATE bank_transactions SET match_status='review' WHERE id=$1`, [row.id]);
    return false;
  }
  const kind = row.direction === 'debit' ? 'expense' : 'income';
  let refundId: string | null = null;
  let categoryId: string | null = null;
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
    if (matches.rowCount === 1) { refundId = matches.rows[0]!.id; categoryId = matches.rows[0]!.category_id; }
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
  trace('created',{bankTransactionId:row.id,ledgerTransactionId:ledgerId,accountId:row.account_id});
  return true;
}

export const MANUAL_MATCH_DATE_TOLERANCE_DAYS = 2;

export async function manualMatchCandidates(client: pg.PoolClient, bankTransactionId: string): Promise<string[]> {
  const result = await client.query<{ id: string }>(`SELECT t.id FROM bank_transactions bt
    JOIN bank_account_links l ON l.id=bt.bank_account_link_id
    JOIN users u ON u.id=bt.user_id
    JOIN transactions t ON t.user_id=bt.user_id AND t.amount=bt.amount AND t.currency=bt.currency
      AND t.kind=CASE bt.direction WHEN 'debit' THEN 'expense'::transaction_kind ELSE 'income'::transaction_kind END
      AND t.method IN ('standard','amortized') AND t.voided_at IS NULL
      AND (t.occurred_at AT TIME ZONE u.timezone)::date BETWEEN
        bt.occurred_on-$2::integer AND bt.occurred_on+$2::integer
      AND ((bt.direction='debit' AND t.source_account_id=l.account_id AND t.destination_account_id IS NULL)
        OR (bt.direction='credit' AND t.destination_account_id=l.account_id AND t.source_account_id IS NULL))
      AND NOT EXISTS(SELECT 1 FROM bank_transactions other WHERE other.ledger_transaction_id=t.id)
    WHERE bt.id=$1 AND bt.ledger_transaction_id IS NULL ORDER BY t.id LIMIT 20 FOR UPDATE OF t`,
    [bankTransactionId,MANUAL_MATCH_DATE_TOLERANCE_DAYS]);
  return result.rows.map(row=>row.id);
}

export async function matchManualTransaction(client: pg.PoolClient, bankTransactionId: string,
  transactionId: string): Promise<boolean> {
  const candidates = await manualMatchCandidates(client,bankTransactionId);
  if (!candidates.includes(transactionId)) return false;
  const result = await client.query(`UPDATE bank_transactions SET ledger_transaction_id=$2,
    match_status='matched_manual',classification_source='manual_match'
    WHERE id=$1 AND match_status IN ('new','review') AND ledger_transaction_id IS NULL`,
    [bankTransactionId,transactionId]);
  return Boolean(result.rowCount);
}

export async function syncConnection(pool: pg.Pool, provider: BankingProvider, secrets: BankingSecrets, userId: string,
  connectionId: string, force = false, sandboxIntervalMinutes = DEFAULT_SYNC_INTERVAL_MINUTES): Promise<BankSyncResult | false> {
  const summary = emptySyncResult();
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
        AND status='active' AND (consent_expires_at IS NULL OR consent_expires_at>now())
        AND (sync_lease_until IS NULL OR sync_lease_until<now())
        AND ($2::boolean OR next_sync_at IS NULL OR next_sync_at<=now())
      RETURNING provider_session_id,consent_expires_at,environment,institution_name`,
      [connectionId,force,provider.id,provider.environment]);
    return result.rows[0];
  });
  if (!connection) return false;
  await withUserTransaction(pool,userId,async client=>{
    await client.query('UPDATE bank_connections SET last_sync_attempt_at=now() WHERE id=$1',[connectionId]);
  });
  let stage = 'session';
  try {
    if (connection.consent_expires_at && connection.consent_expires_at.getTime() <= Date.now()) throw new BankingProviderError('EXPIRED_SESSION');
    if (await provider.sessionStatus(secrets.decrypt(connection.provider_session_id)) !== 'active') throw new BankingProviderError('EXPIRED_SESSION');
    stage = 'load_accounts';
    const links = await withUserTransaction(pool,userId,async (client) =>
      (await client.query<Link>(`SELECT id,connection_id,provider_account_id,account_id,link_mode,currency,last_synced_at,
        (SELECT max(occurred_on)::text FROM bank_transactions
          WHERE bank_account_link_id=bank_account_links.id AND status='BOOK' AND occurred_on<=current_date) AS latest_observed_on
      FROM bank_account_links WHERE connection_id=$1 ORDER BY id`, [connectionId])).rows);
    for (const link of links) {
      summary.accounts++;
      stage = 'balance';
      const balance = await provider.balance(link.provider_account_id);
      if (balance && balance.currency === link.currency && signedBalance(balance.amount) !== null) {
        stage = 'save_balance';
        await withUserTransaction(pool,userId,async (client) => {
          await client.query(`UPDATE bank_account_links SET reported_balance=$2,balance_as_of=coalesce($3::timestamptz,now()) WHERE id=$1`,
            [link.id,balance.amount,balance.asOf]);
        });
      }
      const ordinals = new Map<string,number>();
      const pendingSeen: string[] = [];
      const from = bankFetchFrom(link.latest_observed_on);
      let next: string | null = null;
      for (let page=0;page<500;page++) {
        stage = 'transactions';
        trace('request',{linkId:link.id,providerAccountId:link.provider_account_id,
          from:from??null,strategy:'longest',page:page+1,continuationKeyPresent:Boolean(next)});
        const data: import('./provider.js').BankTransactionPage = await provider.transactions(link.provider_account_id, {
          ...(from ? { from } : {}), ...(next ? { next } : {}), initial: true,
        });
        summary.fetched += data.transactions.length;
        summary.booked += data.transactions.filter(record=>record.status==='BOOK').length;
        summary.pending += data.transactions.filter(record=>['PDNG','HOLD'].includes(record.status)).length;
        trace('page',{linkId:link.id,page:page+1,fetched:data.transactions.length,
          booked:data.transactions.filter(record=>record.status==='BOOK').length,
          pending:data.transactions.filter(record=>['PDNG','HOLD'].includes(record.status)).length,
          continuationKeyPresent:Boolean(data.next)});
        stage = 'save_transactions';
        pendingSeen.push(...await stagePage(pool,userId,link,data.transactions,ordinals,summary));
        next = data.next;
        if (!next) break;
        if (page === 499) throw new BankingProviderError('pagination_limit');
      }
      stage = 'post_transactions';
      await withUserTransaction(pool,userId,async (client) => {
        const currentLink = (await client.query<{ account_id:string|null; link_mode:'new'|'existing'|null; automatic_post_after:Date|null }>(
          'SELECT account_id,link_mode,automatic_post_after FROM bank_account_links WHERE id=$1 FOR UPDATE',[link.id])).rows[0];
        if (currentLink?.account_id) {
          const candidates = await client.query<{ id: string; eligible_for_automatic_post:boolean }>(`SELECT bt.id,
            (bt.first_seen_at > l.automatic_post_after) AS eligible_for_automatic_post
            FROM bank_account_links l
            JOIN bank_transactions bt ON bt.bank_account_link_id=l.id
            WHERE bt.bank_account_link_id=$1 AND (bt.status='BOOK' OR
              (bt.status IN ('PDNG','HOLD') AND bt.id=ANY($2::uuid[]))) AND bt.match_status='new'
            ORDER BY bt.occurred_on,CASE bt.direction WHEN 'debit' THEN 0 ELSE 1 END,bt.id`, [link.id,pendingSeen]);
          for (const candidate of candidates.rows) {
            if ((provider.environment === 'production' || currentLink.link_mode === 'existing') &&
                  !candidate.eligible_for_automatic_post) {
              await client.query(`UPDATE bank_transactions SET match_status='review' WHERE id=$1`,[candidate.id]);
              summary.review++;
              trace('review',{bankTransactionId:candidate.id,reason:'initial_reconciliation_or_booking_date'});
            } else {
              const manual = await manualMatchCandidates(client,candidate.id);
              trace('manual_candidates',{bankTransactionId:candidate.id,candidateIds:manual});
              if (manual.length === 1) {
                if (await matchManualTransaction(client,candidate.id,manual[0]!)) summary.merged++;
              } else if (manual.length > 1) {
                await client.query(`UPDATE bank_transactions SET match_status='review' WHERE id=$1`,[candidate.id]);
                summary.review++;
                trace('review',{bankTransactionId:candidate.id,reason:'ambiguous_manual_match',candidateIds:manual});
              } else if (await postStagedTransaction(client,userId,candidate.id)) summary.created++;
              else {
                summary.review++;
                trace('review',{bankTransactionId:candidate.id,reason:'currency_mismatch_or_not_postable'});
              }
            }
          }
        } else {
          summary.unlinked += (await client.query<{ count:number }>(`SELECT count(*)::integer AS count
            FROM bank_transactions WHERE bank_account_link_id=$1 AND status='BOOK' AND match_status='new'`,[link.id])).rows[0]?.count ?? 0;
        }
        await client.query(`UPDATE bank_account_links SET last_synced_at=now() WHERE id=$1`,[link.id]);
      });
    }
    stage = 'finish_sync';
    await withUserTransaction(pool,userId,async (client) => {
      await client.query(`UPDATE bank_connections SET last_synced_at=now(),
        next_sync_at=now()+($2::integer*interval '1 minute'),sync_lease_until=NULL,error_code=NULL WHERE id=$1`,
        [connectionId,effectiveSyncIntervalMinutes(provider,
          { environment:connection.environment,institutionName:connection.institution_name },sandboxIntervalMinutes)]);
    });
    console.info('Bank sync result',JSON.stringify({connectionId,...summary}));
    trace('complete',{connectionId,...summary});
  } catch (error) {
    // Log only fixed diagnostic labels and HTTP/SQL status codes. Never include
    // provider payloads, request URLs, account identifiers, tokens, or SQL text.
    const knownCodes = new Set(['EXPIRED_SESSION','provider_unavailable','invalid_provider_response',
      'invalid_provider_amount','invalid_provider_zero_adjustment',
      'ACCESS_DENIED','PSU_HEADER_NOT_PROVIDED','WRONG_REQUEST_PARAMETERS',
      'WRONG_TRANSACTIONS_PERIOD','WRONG_DATE_INTERVAL','WRONG_CONTINUATION_KEY',
      'DATE_FROM_IN_FUTURE','DATE_TO_WITHOUT_DATE_FROM','ASPSP_ERROR','ASPSP_TIMEOUT',
      'ASPSP_PSU_ACTION_REQUIRED','ASPSP_ACCOUNT_NOT_ACCESSIBLE','ACCOUNT_DOES_NOT_EXIST',
      'WRONG_SESSION_STATUS','CLOSED_SESSION',
      'production_application_required','sandbox_application_required','pagination_limit',
      'ASPSP_RATE_LIMIT_EXCEEDED','RATE_LIMIT_EXCEEDED']);
    const sqlCode = !(error instanceof BankingProviderError) && error !== null && typeof error === 'object' &&
      'code' in error && typeof error.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? error.code : undefined;
    console.error('Bank synchronization failed', {
      stage,
      kind: error instanceof BankingProviderError ? 'provider' : sqlCode ? 'database' : 'internal',
      ...(error instanceof BankingProviderError ? {
        code: knownCodes.has(error.code) ? error.code : 'other_provider_error',
        httpStatus: error.httpStatus,
      } : sqlCode ? { code: sqlCode } : {}),
    });
    const expired = error instanceof BankingProviderError && error.code === 'EXPIRED_SESSION';
    const limited = error instanceof BankingProviderError &&
      (error.code.includes('RATE_LIMIT') || error.code==='http_429' || error.httpStatus===429);
    const retryAfterMs = error instanceof BankingProviderError && error.retryAfterSeconds
      ? error.retryAfterSeconds*1000 : 0;
    await withUserTransaction(pool,userId,async (client) => {
      await client.query(`UPDATE bank_connections SET status=$2,error_code=$3,next_sync_at=$4,
        last_sync_failed_at=now(),sync_lease_until=NULL WHERE id=$1`, [connectionId,expired?'expired':'active',expired?'consent_expired':limited?'rate_limited':'sync_failed',
        expired?null:new Date(Date.now()+Math.max((limited?6:1)*3600_000,retryAfterMs))]);
    });
    throw error;
  }
  return summary;
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
  await withUserTransaction(pool,ownerUserId,async client=>{
    await client.query(`UPDATE bank_connections SET status='expired',error_code='consent_expired',
      next_sync_at=NULL,sync_lease_until=NULL WHERE user_id=$1 AND provider=$2 AND environment=$3
      AND status='active' AND consent_expires_at<=now()`,[ownerUserId,provider.id,provider.environment]);
  });
  const ids = await withUserTransaction(pool,ownerUserId,async (client) =>
    (await client.query<{ id: string }>(`SELECT id FROM bank_connections WHERE provider=$1 AND environment=$2
      AND user_id=$3 AND status='active' AND next_sync_at<=now()
      AND (consent_expires_at IS NULL OR consent_expires_at>now())
      AND (sync_lease_until IS NULL OR sync_lease_until<now()) LIMIT 10`,
      [provider.id,provider.environment,ownerUserId])).rows);
  for (const { id } of ids) {
    try { await syncConnection(pool,provider,secrets,ownerUserId,id,false,sandboxIntervalMinutes); } catch (error) {
      console.error('Bank sync failed', { name: error instanceof Error ? error.name : 'UnknownError' });
    }
  }
}
