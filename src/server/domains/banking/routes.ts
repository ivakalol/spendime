import { createHash, randomUUID } from 'node:crypto';
import { Router } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import { bankingCredentialConfig, bankingRuntimeEnabled, hasBankingAccess, type AppConfig } from '../../config.js';
import { withUserTransaction } from '../../db/transactions.js';
import { ApiError } from '../../errors.js';
import { requireAuthentication } from '../../middleware/authenticate.js';
import { authenticatedUserId, inUserTransaction, requireRow } from '../../routes/helpers.js';
import { uuidSchema } from '../../validation/common.js';
import { BankingProviderError, type BankingProvider } from './provider.js';
import { postStagedTransaction, syncConnection } from './sync.js';
import { merchantKey } from './categorize.js';
import { voidTransaction } from '../transactions/repository.js';
import type { BankingSecrets } from './secrets.js';

const stateHash = (state: string) => createHash('sha256').update(state).digest('hex');
const countrySchema = z.string().regex(/^[A-Z]{2}$/).default('BG');
const selectSchema = z.object({ country: countrySchema, name: z.string().min(1).max(160) }).strict();
const linkSchema = z.object({ accountId: uuidSchema.nullable().default(null) }).strict();

function providerError(error: unknown): never {
  if (error instanceof BankingProviderError) {
    if (error.code === 'EXPIRED_SESSION') throw new ApiError(409, 'bank_consent_expired', 'Bank access expired. Reconnect this bank.');
    if (error.code.includes('RATE_LIMIT') || error.code === 'http_429' || error.httpStatus===429)
      throw new ApiError(429, 'bank_rate_limited', 'The bank is temporarily limiting requests. Try later.');
    throw new ApiError(502, 'bank_provider_unavailable', 'The bank connection is temporarily unavailable. Try again later.');
  }
  throw error;
}

function requireBankingOrigin(config: AppConfig) {
  return (request: import('express').Request, _response: import('express').Response, next: import('express').NextFunction) => {
    const expected = config.appOrigin ?? `${request.protocol}://${request.get('host')}`;
    if (request.get('origin') !== expected || request.get('sec-fetch-site') === 'cross-site') {
      next(new ApiError(403, 'origin_not_allowed', 'Request origin is not allowed.'));
    } else next();
  };
}

export function createBankingRouter(pool: pg.Pool, config: AppConfig, provider?: BankingProvider, secrets?: BankingSecrets): Router {
  const router = Router();
  router.use(requireAuthentication(pool));
  router.use((request, _response, next) => hasBankingAccess(config, authenticatedUserId(request))
    ? next() : next(new ApiError(403, 'banking_forbidden', 'Banking access is restricted.')));
  router.use((_, _response, next) => bankingRuntimeEnabled(config)
    ? next() : next(new ApiError(503, 'banking_disabled', 'Banking is disabled in this environment.')));
  router.use((_, _response, next) => provider && secrets ? next() : next(new ApiError(503, 'banking_not_configured', 'Banking is not configured.')));
  const bank = provider!;
  const credentials = bankingCredentialConfig(config);
  const origin = requireBankingOrigin(config);
  // A bank ID from another environment must never be usable through this runtime,
  // even if both environments were accidentally pointed at the same database.
  router.param('id', async (request, _response, next, value) => {
    const kind = request.path.split('/')[1] ?? '';
    if (!['connections','links','review','transactions'].includes(kind)) return next();
    const id = uuidSchema.safeParse(value);
    if (!id.success) return next(new ApiError(404,'not_found','Banking record was not found.'));
    const found = await inUserTransaction(pool,request,async client => {
      const table = kind === 'connections' ? 'bank_connections c' :
        kind === 'links' ? 'bank_account_links l JOIN bank_connections c ON c.id=l.connection_id' :
        kind === 'review' ? 'bank_transactions bt JOIN bank_account_links l ON l.id=bt.bank_account_link_id JOIN bank_connections c ON c.id=l.connection_id' :
          'transactions t JOIN bank_transactions bt ON bt.ledger_transaction_id=t.id JOIN bank_account_links l ON l.id=bt.bank_account_link_id JOIN bank_connections c ON c.id=l.connection_id';
      const column = kind === 'connections' ? 'c.id' : kind === 'links' ? 'l.id' : kind === 'review' ? 'bt.id' : 't.id';
      return (await client.query(`SELECT 1 FROM ${table} WHERE ${column}=$1 AND c.provider=$2 AND c.environment=$3 LIMIT 1`,
        [id.data,bank.id,bank.environment])).rowCount;
    });
    return found ? next() : next(new ApiError(404,'not_found','Banking record was not found.'));
  });

  router.get('/ai', async (_request,response) => {
    response.json({ data:{ available:false, enabled:false } });
  });
  router.put('/ai', origin, async (request,response) => {
    const { enabled } = z.object({ enabled:z.boolean() }).strict().parse(request.body);
    if (enabled) throw new ApiError(409,'gemini_unavailable','Automatic bank categorization is disabled for this workflow.');
    await inUserTransaction(pool,request,async (client,userId) => {
      await client.query(`INSERT INTO bank_ai_preferences(user_id,enabled,accepted_at) VALUES($1,$2,CASE WHEN $2 THEN now() ELSE NULL END)
        ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,accepted_at=excluded.accepted_at,updated_at=now()`,[userId,enabled]);
    });
    response.json({ data:{ enabled } });
  });

  router.get('/rules', async(request,response)=>{
    const data=await inUserTransaction(pool,request,async(client)=>(await client.query(`SELECT r.id,r.merchant_key AS "merchantKey",
      r.direction,r.category_id AS "categoryId",c.name AS "categoryName" FROM bank_category_rules r
      JOIN categories c ON c.id=r.category_id WHERE r.source='explicit' ORDER BY r.merchant_key`)).rows);
    response.json({data});
  });
  router.post('/rules', origin, async(request,response)=>{
    const input=z.object({merchant:z.string().min(2).max(120),direction:z.enum(['debit','credit']),categoryId:uuidSchema}).strict().parse(request.body);
    const key=merchantKey(input.merchant);
    if(!key)throw new ApiError(400,'invalid_merchant','Enter a merchant name.');
    const data=await inUserTransaction(pool,request,async(client,userId)=>{
      const category=await client.query(`SELECT id FROM categories WHERE id=$1 AND NOT is_archived AND kind IN ($2,'both')`,
        [input.categoryId,input.direction==='credit'?'income':'expense']);
      if(!category.rowCount)throw new ApiError(404,'category_not_found','Choose an active category for this transaction direction.');
      const result=await client.query(`INSERT INTO bank_category_rules(user_id,merchant_key,direction,category_id,source)
        VALUES($1,$2,$3,$4,'explicit') ON CONFLICT(user_id,merchant_key,direction,source)
        DO UPDATE SET category_id=excluded.category_id RETURNING id`,[userId,key,input.direction,input.categoryId]);
      return result.rows[0];
    });
    response.status(201).json({data});
  });
  router.delete('/rules/:id',origin,async(request,response)=>{
    const id=uuidSchema.parse(request.params.id);
    await inUserTransaction(pool,request,async(client)=>{
      const result=await client.query(`DELETE FROM bank_category_rules WHERE id=$1 AND source='explicit'`,[id]);
      if(!result.rowCount)throw new ApiError(404,'not_found','Rule was not found.');
    });
    response.status(204).send();
  });

  router.get('/institutions', async (request, response) => {
    const country = countrySchema.parse(request.query.country);
    try { response.json({ data: await bank.institutions(country) }); } catch (error) { providerError(error); }
  });

  router.get('/connections', async (request, response) => {
    const data = await inUserTransaction(pool, request, async (client) => {
      const connections = (await client.query(`SELECT id,provider,environment,institution_name AS "institutionName",
          institution_country AS "institutionCountry",status,consent_expires_at AS "consentExpiresAt",
          last_synced_at AS "lastSyncedAt",next_sync_at AS "nextSyncAt",error_code AS "errorCode",(sync_lease_until>now()) AS "syncing" FROM bank_connections
          WHERE provider=$1 AND environment=$2 ORDER BY created_at DESC`,[bank.id,bank.environment])).rows;
      const links = (await client.query(`SELECT l.id,l.connection_id AS "connectionId",l.name,l.currency,
          l.account_id AS "accountId",l.reported_balance AS "reportedBalance",l.balance_as_of AS "balanceAsOf",
          l.balance_status AS "balanceStatus",l.last_synced_at AS "lastSyncedAt",
          l.link_mode AS "linkMode",l.automatic_post_after AS "automaticPostAfter",
          (SELECT count(*)::integer FROM bank_transactions bt WHERE bt.bank_account_link_id=l.id
            AND bt.match_status='review') AS "reviewCount",
          a.current_balance AS "ledgerBalance"
          FROM bank_account_links l LEFT JOIN account_balances a ON a.account_id=l.account_id
          JOIN bank_connections c ON c.id=l.connection_id
          WHERE c.provider=$1 AND c.environment=$2 ORDER BY l.name`,[bank.id,bank.environment])).rows;
      return connections.map((connection) => ({ ...connection, accounts: links.filter((link) => link.connectionId === connection.id) }));
    });
    response.json({ data });
  });

  async function begin(request: import('express').Request, connectionId?: string) {
    if (!credentials.redirectUri) throw new ApiError(503, 'banking_redirect_missing', 'Banking callback is not configured.');
    const uri = new URL(credentials.redirectUri);
    if (uri.pathname !== '/api/banking/callback' || uri.search || uri.hash || uri.username || uri.password ||
      !(uri.protocol === 'https:' || (config.nodeEnv !== 'production' && uri.hostname === 'localhost')) ||
      (config.nodeEnv === 'production' && (!config.appOrigin || uri.origin !== config.appOrigin))) {
      throw new ApiError(503, 'banking_redirect_invalid', 'Banking callback configuration is invalid.');
    }
    const input = connectionId ? await inUserTransaction(pool, request, async (client) => {
      const row = (await client.query(`SELECT institution_name AS name,institution_country AS country FROM bank_connections
        WHERE id=$1 AND provider=$2 AND environment=$3 `, [connectionId,bank.id,bank.environment])).rows[0];
      return requireRow(row) as { name: string; country: string };
    }) : selectSchema.parse(request.body);
    let institution;
    try { institution = (await bank.institutions(input.country)).find((item) => item.name === input.name); }
    catch (error) { providerError(error); }
    if (!institution) throw new ApiError(404, 'bank_not_found', 'This bank is not available.');
    const state = randomUUID();
    let url: string;
    try { url = (await bank.begin({ institution, state, redirectUri: credentials.redirectUri })).url; }
    catch (error) { providerError(error); }
    const userId = authenticatedUserId(request);
    const id = await withUserTransaction(pool, userId, async (client) => {
      const connection = connectionId ?? (await client.query<{ id: string }>(`INSERT INTO bank_connections
        (user_id,provider,environment,institution_name,institution_country)
        VALUES($1,$2,$3,$4,$5) RETURNING id`, [userId, bank.id, bank.environment, institution.name, institution.country])).rows[0]!.id;
      await client.query(`INSERT INTO bank_auth_attempts(user_id,connection_id,state_hash,expires_at)
        VALUES($1,$2,$3,now()+interval '15 minutes')`, [userId, connection, stateHash(state)]);
      return connection;
    });
    return { connectionId: id, authorizationUrl: url! };
  }

  router.post('/connections', origin, async (request, response) => response.status(201).json({ data: await begin(request) }));
  router.post('/connections/:id/renew', origin, async (request, response) => {
    const id = uuidSchema.parse(request.params.id);
    response.json({ data: await begin(request, id) });
  });

  router.get('/callback', async (request, response) => {
    const query = z.object({ state: z.string().uuid(), code: z.string().optional(), error: z.string().optional() }).passthrough().parse(request.query);
    const attempt = await inUserTransaction(pool, request, async (client) =>
      (await client.query<{ connection_id: string }>(`UPDATE bank_auth_attempts SET consumed_at=now()
       WHERE state_hash=$1 AND consumed_at IS NULL AND expires_at>now()
         AND connection_id IN (SELECT id FROM bank_connections WHERE provider=$2 AND environment=$3) RETURNING connection_id`,
       [stateHash(query.state),bank.id,bank.environment])).rows[0]);
    if (!attempt) throw new ApiError(400, 'invalid_bank_state', 'This bank connection link is invalid or expired.');
    async function recordFailure(error: unknown) {
      // Keep an existing consent usable when a renewal fails. Never store provider
      // messages, authorization codes, or tokens in the connection error field.
      const code = error instanceof ApiError ? error.code : 'authorization_exchange_failed';
      await inUserTransaction(pool, request, async (client) => {
        await client.query(`UPDATE bank_connections SET
          status=CASE WHEN provider_session_id IS NULL THEN 'error' ELSE status END,
          error_code=$2 WHERE id=$1`, [attempt!.connection_id, code]);
      });
    }
    if (query.error || !query.code) {
      await inUserTransaction(pool, request, async (client) => {
        await client.query(`UPDATE bank_auth_attempts SET consumed_at=now() WHERE state_hash=$1 AND consumed_at IS NULL`, [stateHash(query.state)]);
        await client.query(`UPDATE bank_connections SET status='error',error_code='authorization_failed' WHERE id=$1`, [attempt.connection_id]);
      });
      response.redirect(303, `${config.appOrigin ?? ''}/banking?result=authorization_failed`);
      return;
    }
    let session;
    try { session = await bank.complete(query.code); } catch (error) {
      await recordFailure(error);
      providerError(error);
    }
    const userId = authenticatedUserId(request);
    const priorSession = await withUserTransaction(pool, userId, async (client) => {

      // Serialize callbacks for this user, including simultaneous new connections.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,1))',[userId]);
      for (const account of session.accounts) {
        const duplicate = await client.query(`SELECT l.id FROM bank_account_links l
          JOIN bank_connections c ON c.id=l.connection_id
          WHERE l.identification_hash=$1 AND l.connection_id<>$2 AND c.provider=$3 AND c.environment=$4`,
          [account.identificationHash,attempt.connection_id,bank.id,bank.environment]);
        if (duplicate.rowCount) throw new ApiError(409,'bank_account_already_connected','This bank account is already connected. Reconnect the original connection to preserve its history.');
        const changed = await client.query(`SELECT id FROM bank_account_links
          WHERE connection_id=$1 AND identification_hash=$2 AND currency<>$3`,[attempt.connection_id,account.identificationHash,account.currency]);
        if(changed.rowCount) throw new ApiError(409,'bank_currency_changed','The bank changed this account currency. Review the existing account before importing more history.');
      }

      const prior = (await client.query<{ provider_session_id:string|null }>(
        'SELECT provider_session_id FROM bank_connections WHERE id=$1 FOR UPDATE',[attempt.connection_id])).rows[0]?.provider_session_id ?? null;
      await client.query(`UPDATE bank_connections SET provider_session_id=$2,status='active',
        consent_expires_at=$3,error_code=NULL,next_sync_at=now() WHERE id=$1`, [attempt.connection_id, secrets!.encrypt(session.sessionId), session.expiresAt]);
      for (const account of session.accounts) {
        await client.query(`INSERT INTO bank_account_links(user_id,connection_id,provider_account_id,identification_hash,name,currency)
          VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(connection_id,identification_hash) DO UPDATE SET
          provider_account_id=excluded.provider_account_id,name=excluded.name`,
        [userId, attempt.connection_id, account.providerAccountId, account.identificationHash, account.name, account.currency]);
      }
      return prior;
    }).catch(async error => {
      try { await bank.disconnect(session.sessionId); } catch { /* No credentials are logged. */ }
      await recordFailure(error);
      throw error;
    });
    if (priorSession && secrets!.decrypt(priorSession) !== session.sessionId) {
      try { await bank.disconnect(secrets!.decrypt(priorSession)); } catch { /* The old consent may already be expired. */ }
    }
    response.redirect(303, `${config.appOrigin ?? ''}/banking?result=connected`);
  });

  router.post('/links/:id/link', origin, async (request, response) => {
    const id = uuidSchema.parse(request.params.id);
    const input = linkSchema.parse(request.body);
    const data = await inUserTransaction(pool, request, async (client, userId) => {
      const link = (await client.query<{ id: string; name: string; currency: string; account_id: string | null; connection_id:string }>(
        `SELECT l.id,l.name,l.currency,l.account_id,l.connection_id FROM bank_account_links l
         JOIN bank_connections c ON c.id=l.connection_id AND c.status='active' WHERE l.id=$1 FOR UPDATE OF l`, [id])).rows[0];
      if (!link) throw new ApiError(404, 'not_found', 'Bank account was not found.');
      if (link.account_id) throw new ApiError(409, 'already_linked', 'This bank account is already linked.');
      let accountId = input.accountId;
      if (accountId) {
        const account = (await client.query(`SELECT id FROM accounts WHERE id=$1 AND currency=$2 AND NOT is_archived`, [accountId, link.currency])).rows[0];
        if (!account) throw new ApiError(404, 'not_found', 'A matching money account was not found.');
        const occupied = await client.query(`SELECT id FROM bank_account_links WHERE account_id=$1`, [accountId]);
        if (occupied.rowCount) throw new ApiError(409, 'account_already_linked', 'This money account is connected to another bank account.');
      } else {
        const name = `${link.name} ${link.currency}`.slice(0, 100);
        const uniqueName = (await client.query('SELECT id FROM accounts WHERE name=$1', [name])).rowCount ? `${name.slice(0, 85)} ${id.slice(0, 8)}` : name;
        accountId = (await client.query<{ id: string }>(`INSERT INTO accounts(user_id,name,kind,currency,opening_balance,institution)
          VALUES($1,$2,'checking',$3,0,$4) RETURNING id`, [userId, uniqueName, link.currency, link.name])).rows[0]!.id;
      }
      await client.query(`UPDATE bank_account_links SET account_id=$2,link_mode=$3,balance_status='unreconciled' WHERE id=$1`, [id, accountId, input.accountId ? 'existing' : 'new']);
      const staged = await client.query<{ id: string }>(`SELECT id FROM bank_transactions WHERE bank_account_link_id=$1 AND status='BOOK' AND match_status='new'
        ORDER BY occurred_on,CASE direction WHEN 'debit' THEN 0 ELSE 1 END,id`,[id]);
      for (const row of staged.rows) {
        if (input.accountId || bank.environment === 'production') await client.query(`UPDATE bank_transactions SET match_status='review' WHERE id=$1`,[row.id]);
        else await postStagedTransaction(client,userId,row.id);
      }
      await client.query(`UPDATE bank_connections SET next_sync_at=now() WHERE id=$1 AND status='active'
        AND (environment='sandbox' OR last_synced_at IS NULL)`,[link.connection_id]);
      return { accountId };
    });
    response.json({ data });
  });

  router.post('/connections/:id/sync', origin, async (request, response) => {
    const id = uuidSchema.parse(request.params.id);
    const userId = authenticatedUserId(request);
    const due = await inUserTransaction(pool,request,async (client) =>
      (await client.query(`SELECT id FROM bank_connections WHERE id=$1 AND status='active'
      AND (next_sync_at IS NULL OR next_sync_at<=now())`,[id])).rows[0]);
    if (!due) throw new ApiError(429,'sync_not_due','This bank can be synchronized again at its next scheduled time.');
    try {
      if (!await syncConnection(pool,bank,secrets!,userId,id,false,config.sandboxSyncIntervalMinutes))
        throw new ApiError(409,'sync_in_progress','This bank is already synchronizing.');
    } catch (error) { providerError(error); }
    response.json({ data: { requested: true } });
  });

  router.get('/review', async (request,response) => {
    const data = await inUserTransaction(pool,request,async (client) =>
      (await client.query(`SELECT bt.id,bt.bank_account_link_id AS "bankAccountLinkId",l.name AS "accountName",
        bt.direction,bt.amount,bt.currency,bt.occurred_on::text AS "occurredOn",bt.merchant,bt.description,bt.status,
        bt.ledger_transaction_id AS "ledgerTransactionId",bt.proposed_amount AS "proposedAmount",
        bt.proposed_currency AS "proposedCurrency",bt.proposed_occurred_on::text AS "proposedOccurredOn"
        FROM bank_transactions bt JOIN bank_account_links l ON l.id=bt.bank_account_link_id
        JOIN bank_connections c ON c.id=l.connection_id
        WHERE bt.match_status='review' AND c.provider=$1 AND c.environment=$2
        ORDER BY bt.occurred_on DESC LIMIT 200`,[bank.id,bank.environment])).rows);
    response.json({ data });
  });

  router.get('/review/:id/candidates', async (request,response) => {
    const id = uuidSchema.parse(request.params.id);
    const data = await inUserTransaction(pool,request,async (client) =>
      (await client.query(`SELECT t.id,t.description,t.merchant,t.amount,t.currency,t.occurred_at AS "occurredAt",t.kind
        FROM bank_transactions bt JOIN bank_account_links l ON l.id=bt.bank_account_link_id
        JOIN transactions t ON t.amount=bt.amount AND t.currency=bt.currency
          AND t.occurred_at::date BETWEEN bt.occurred_on-interval '3 days' AND bt.occurred_on+interval '3 days'
          AND ((bt.direction='debit' AND t.source_account_id=l.account_id)
            OR (bt.direction='credit' AND t.destination_account_id=l.account_id))
        WHERE bt.id=$1 AND bt.match_status='review' AND t.voided_at IS NULL
          AND NOT EXISTS(SELECT 1 FROM bank_transactions other WHERE other.ledger_transaction_id=t.id)
        ORDER BY abs(extract(epoch FROM (t.occurred_at-bt.occurred_on::timestamp))) LIMIT 20`,[id])).rows);
    response.json({ data });
  });

  router.get('/transfers/candidates', async (request,response) => {
    const data = await inUserTransaction(pool,request,async (client) =>
      (await client.query(`SELECT bt.id,bt.direction,bt.amount,bt.currency,bt.occurred_on::text AS "occurredOn",
        bt.merchant,l.name AS "accountName" FROM bank_transactions bt
        JOIN bank_account_links l ON l.id=bt.bank_account_link_id
        JOIN transactions t ON t.id=bt.ledger_transaction_id
        JOIN bank_connections c ON c.id=l.connection_id
        WHERE bt.match_status='posted' AND bt.status='BOOK' AND bt.occurred_on>=current_date-interval '90 days'
          AND c.provider=$1 AND c.environment=$2
          AND t.voided_at IS NULL AND NOT t.category_locked AND t.kind IN ('expense','income')
          AND NOT EXISTS(SELECT 1 FROM bank_transfer_pairs p WHERE p.debit_bank_transaction_id=bt.id OR p.credit_bank_transaction_id=bt.id)
        ORDER BY bt.occurred_on DESC LIMIT 200`,[bank.id,bank.environment])).rows);
    response.json({ data });
  });

  router.post('/review/:id/post', origin, async (request,response) => {
    const id = uuidSchema.parse(request.params.id);
    await inUserTransaction(pool,request,async (client,userId) => {
      const tx = (await client.query(`SELECT id FROM bank_transactions WHERE id=$1 AND match_status='review' AND status='BOOK'
        AND ledger_transaction_id IS NULL`,[id])).rows[0];
      if (!tx) throw new ApiError(404,'not_found','Bank transaction was not found.');
      await client.query(`UPDATE bank_transactions SET match_status='new' WHERE id=$1`,[id]);
      await postStagedTransaction(client,userId,id);
      const posted = await client.query(`SELECT id FROM bank_transactions WHERE id=$1 AND match_status='posted'`,[id]);
      if (!posted.rowCount) throw new ApiError(409,'bank_currency_mismatch','This bank amount uses a different currency from the linked money account. Review it manually before posting.');
    });
    response.json({ data: { posted: true } });
  });

  router.post('/review/:id/match', origin, async (request,response) => {
    const id = uuidSchema.parse(request.params.id);
    const { transactionId } = z.object({ transactionId: uuidSchema }).strict().parse(request.body);
    await inUserTransaction(pool,request,async (client) => {
      const matched = await client.query(`UPDATE bank_transactions bt SET ledger_transaction_id=$2,match_status='matched_manual'
        FROM bank_account_links l,transactions t WHERE bt.id=$1 AND bt.match_status='review'
        AND bt.ledger_transaction_id IS NULL
        AND l.id=bt.bank_account_link_id AND t.id=$2 AND t.user_id=bt.user_id
        AND NOT EXISTS(SELECT 1 FROM bank_transactions other WHERE other.ledger_transaction_id=t.id)
        AND t.voided_at IS NULL AND t.amount=bt.amount AND t.currency=bt.currency
        AND t.occurred_at::date BETWEEN bt.occurred_on-interval '3 days' AND bt.occurred_on+interval '3 days'
        AND ((bt.direction='debit' AND t.source_account_id=l.account_id)
          OR (bt.direction='credit' AND t.destination_account_id=l.account_id)) RETURNING bt.id`,[id,transactionId]);
      if (!matched.rowCount) throw new ApiError(409,'manual_match_invalid','The selected entry does not match this bank transaction.');
    });
    response.json({ data: { matched: true } });
  });

  router.post('/review/:id/keep', origin, async(request,response)=>{
    const id=uuidSchema.parse(request.params.id);
    await inUserTransaction(pool,request,async(client)=>{
      const kept=await client.query(`UPDATE bank_transactions SET match_status='posted',
        amount=COALESCE(proposed_amount,amount),currency=COALESCE(proposed_currency,currency),
        occurred_on=COALESCE(proposed_occurred_on,occurred_on),direction=COALESCE(proposed_direction,direction),
        merchant=COALESCE(proposed_merchant,merchant),description=COALESCE(proposed_description,description),
        proposed_amount=NULL,proposed_currency=NULL,proposed_occurred_on=NULL,proposed_direction=NULL,
        proposed_merchant=NULL,proposed_description=NULL WHERE id=$1
        AND match_status='review' AND ledger_transaction_id IS NOT NULL RETURNING id`,[id]);
      if(!kept.rowCount)throw new ApiError(409,'review_unavailable','This bank transaction is not linked to an existing entry.');
    });
    response.json({data:{kept:true}});
  });

  router.post('/links/:id/complete-initial-review', origin, async(request,response)=>{
    const id=uuidSchema.parse(request.params.id);
    await inUserTransaction(pool,request,async(client)=>{
      const link=(await client.query<{ id:string; last_synced_at:Date|null; automatic_post_after:Date|null }>(`
        SELECT l.id,l.last_synced_at,l.automatic_post_after FROM bank_account_links l
        JOIN bank_connections c ON c.id=l.connection_id AND c.status='active'
        WHERE l.id=$1 AND l.account_id IS NOT NULL AND (l.link_mode='existing' OR $2::boolean)
          AND c.provider=$3 AND c.environment=$4 FOR UPDATE OF l`,
        [id,bank.environment==='production',bank.id,bank.environment])).rows[0];
      if(!link || !link.last_synced_at || link.automatic_post_after)
        throw new ApiError(409,'initial_review_unavailable','Finish the first bank sync before completing reconciliation.');
      const unresolved=await client.query(`SELECT id FROM bank_transactions WHERE bank_account_link_id=$1
        AND status='BOOK' AND match_status IN ('new','review') AND ledger_transaction_id IS NULL LIMIT 1`,[id]);
      if(unresolved.rowCount) throw new ApiError(409,'historical_review_incomplete','Resolve all booked historical movements before enabling automatic imports.');
      await client.query(`UPDATE bank_account_links SET automatic_post_after=now() WHERE id=$1`,[id]);
    });
    response.json({data:{automaticPostingEnabled:true}});
  });

  router.post('/links/:id/reconcile', origin, async (request,response) => {
    const id = uuidSchema.parse(request.params.id);
    throw new ApiError(409,'balance_review_required','Review your opening balance against a dated bank statement. A live bank balance cannot safely determine it automatically.');
  });

  router.post('/transfers/pair', origin, async (request,response) => {
    const { debitId, creditId } = z.object({ debitId: uuidSchema, creditId: uuidSchema }).strict().parse(request.body);
    if (debitId === creditId) throw new ApiError(400,'invalid_pair','Select two different bank transactions.');
    const data = await inUserTransaction(pool,request,async (client,userId) => {
      const result = await client.query<any>(`SELECT bt.id,bt.direction,bt.amount,bt.currency,bt.occurred_on,bt.ledger_transaction_id,
        l.account_id,t.category_locked,t.kind FROM bank_transactions bt
        JOIN bank_account_links l ON l.id=bt.bank_account_link_id
        JOIN transactions t ON t.id=bt.ledger_transaction_id
        JOIN bank_connections c ON c.id=l.connection_id
        WHERE bt.id IN ($1,$2) AND bt.status='BOOK' AND bt.match_status='posted'
          AND c.provider=$3 AND c.environment=$4 FOR UPDATE OF bt`,[debitId,creditId,bank.id,bank.environment]);
      const debit = result.rows.find((x:any)=>x.id===debitId && x.direction==='debit');
      const credit = result.rows.find((x:any)=>x.id===creditId && x.direction==='credit');
      if (!debit || !credit || !debit.account_id || !credit.account_id || debit.account_id===credit.account_id ||
          debit.category_locked || credit.category_locked || debit.kind!=='expense' || credit.kind!=='income' ||
          Math.abs(new Date(debit.occurred_on).getTime()-new Date(credit.occurred_on).getTime())>3*86400_000)
        throw new ApiError(409,'invalid_pair','These bank transactions cannot be paired safely.');
      await voidTransaction(client,debit.ledger_transaction_id,'Reclassified as an own-account transfer');
      await voidTransaction(client,credit.ledger_transaction_id,'Reclassified as an own-account transfer');
      let debitLedger: string;
      let creditLedger: string;
      if (debit.currency===credit.currency && debit.amount===credit.amount) {
        const inserted = await client.query<{ id:string }>(`INSERT INTO transactions(user_id,kind,source_account_id,destination_account_id,
          amount,currency,occurred_at,description) VALUES($1,'transfer',$2,$3,$4,$5,
          ($6::date+time '12:00:00') AT TIME ZONE (SELECT timezone FROM users WHERE id=$1),'Own bank transfer') RETURNING id`,
        [userId,debit.account_id,credit.account_id,debit.amount,debit.currency,debit.occurred_on]);
        debitLedger=creditLedger=inserted.rows[0]!.id;
      } else {
        const inserted = await client.query<{ id:string }>(`INSERT INTO transactions(user_id,kind,source_account_id,destination_account_id,
          amount,currency,occurred_at,description) VALUES($1,'adjustment',$2,$3,$4,$5,
          ($6::date+time '12:00:00') AT TIME ZONE (SELECT timezone FROM users WHERE id=$1),'Own bank FX transfer') RETURNING id`,
        [userId,debit.account_id,null,debit.amount,debit.currency,debit.occurred_on]);
        debitLedger=inserted.rows[0]!.id;
        const other = await client.query<{ id:string }>(`INSERT INTO transactions(user_id,kind,source_account_id,destination_account_id,
          amount,currency,occurred_at,description) VALUES($1,'adjustment',$2,$3,$4,$5,
          ($6::date+time '12:00:00') AT TIME ZONE (SELECT timezone FROM users WHERE id=$1),'Own bank FX transfer') RETURNING id`,
        [userId,null,credit.account_id,credit.amount,credit.currency,credit.occurred_on]);
        creditLedger=other.rows[0]!.id;
      }
      await client.query(`UPDATE bank_transactions SET ledger_transaction_id=$2,classification_source='transfer' WHERE id=$1`,[debitId,debitLedger]);
      await client.query(`UPDATE bank_transactions SET ledger_transaction_id=$2,classification_source='transfer' WHERE id=$1`,[creditId,creditLedger]);
      await client.query(`INSERT INTO bank_transfer_pairs(user_id,debit_bank_transaction_id,credit_bank_transaction_id) VALUES($1,$2,$3)`,[userId,debitId,creditId]);
      return { paired: true, crossCurrency: debit.currency!==credit.currency };
    });
    response.json({ data });
  });

  router.post('/transactions/:id/remember-category', origin, async (request,response) => {
    const id = uuidSchema.parse(request.params.id);
    const data = await inUserTransaction(pool,request,async (client,userId) => {
      const tx = (await client.query<{ merchant:string|null; direction:string; category_id:string|null }>(`
        SELECT t.merchant,bt.direction,t.category_id FROM transactions t
        JOIN bank_transactions bt ON bt.ledger_transaction_id=t.id WHERE t.id=$1 AND t.category_locked=true
        AND t.category_id IS NOT NULL LIMIT 1`,[id])).rows[0];
      const key = merchantKey(tx?.merchant ?? null);
      if (!tx || !key) throw new ApiError(409,'preference_unavailable','Edit the category of a bank transaction with a merchant first.');
      await client.query(`INSERT INTO bank_category_rules(user_id,merchant_key,direction,category_id,source)
        VALUES($1,$2,$3,$4,'confirmed') ON CONFLICT(user_id,merchant_key,direction,source)
        DO UPDATE SET category_id=excluded.category_id`,[userId,key,tx.direction,tx.category_id]);
      return { saved: true };
    });
    response.json({ data });
  });

  router.post('/connections/:id/disconnect', origin, async (request, response) => {
    const id = uuidSchema.parse(request.params.id);
    const connection = await inUserTransaction(pool, request, async (client) =>
      (await client.query<{ provider_session_id: string | null }>(`SELECT provider_session_id FROM bank_connections WHERE id=$1 AND status<>'disconnected'`, [id])).rows[0]);
    if (!connection) throw new ApiError(404, 'not_found', 'Bank connection was not found.');
    let revocationConfirmed = true;
    if (connection.provider_session_id) {
      try { await bank.disconnect(secrets!.decrypt(connection.provider_session_id)); }
      catch { revocationConfirmed = false; }
    }
    await inUserTransaction(pool, request, async (client) => {
      await client.query(`UPDATE bank_connections SET status='disconnected',provider_session_id=NULL,next_sync_at=NULL,
        error_code=$2 WHERE id=$1`, [id,revocationConfirmed?null:'remote_revocation_unconfirmed']);
      await client.query(`DELETE FROM bank_auth_attempts WHERE connection_id=$1`, [id]);
    });
    response.status(204).send();
  });
  router.delete('/connections/:id/data', origin, async (request,response) => {
    const id = uuidSchema.parse(request.params.id);
    await inUserTransaction(pool,request,async(client)=>{
      const connection = await client.query(`SELECT id FROM bank_connections WHERE id=$1 AND status='disconnected' FOR UPDATE`,[id]);
      if (!connection.rowCount) throw new ApiError(409,'connection_not_disconnected','Disconnect this bank before removing its stored connection data.');
      await client.query(`DELETE FROM bank_transfer_pairs WHERE debit_bank_transaction_id IN (
        SELECT bt.id FROM bank_transactions bt JOIN bank_account_links l ON l.id=bt.bank_account_link_id WHERE l.connection_id=$1)
        OR credit_bank_transaction_id IN (
        SELECT bt.id FROM bank_transactions bt JOIN bank_account_links l ON l.id=bt.bank_account_link_id WHERE l.connection_id=$1)`,[id]);
      await client.query('DELETE FROM bank_connections WHERE id=$1',[id]);
    });
    response.status(204).send();
  });
  return router;
}
