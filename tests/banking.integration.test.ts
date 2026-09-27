import type { Express } from 'express';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { assertSafeRuntimeRole, createPool } from '../src/server/db/pool.js';
import { withUserTransaction } from '../src/server/db/transactions.js';
import type { BankTransaction, BankingProvider } from '../src/server/domains/banking/provider.js';
import { rescheduleSandboxMockConnections, syncConnection, syncDueConnections } from '../src/server/domains/banking/sync.js';
import { BankingSecrets } from '../src/server/domains/banking/secrets.js';
import { BankingProviderError } from '../src/server/domains/banking/provider.js';

const today=new Date().toISOString().slice(0,10);
const tx=(reference:string,direction:'debit'|'credit',amount:string,currency:string,merchant:string,status='BOOK'):BankTransaction=>({
  entryReference:reference,direction,amount,currency,merchant,status,occurredOn:today,
  description:reference.startsWith('refund')?`Refund ${merchant}`:merchant,counterpartyHash:null,
});
class MockBank implements BankingProvider {
  readonly id='enable_banking'; readonly environment='sandbox' as const;
  entries=new Map<string,BankTransaction[]>();
  expired=false; outage=false;
  rateLimited=false; retryAfterSeconds=0;
  async institutions(country:string){return ['Mock ASPSP','Second Test Bank'].map(name=>({name,country,beta:false,maximumConsentValiditySeconds:86400}));}
  async begin(input:{state:string}){return {url:`https://auth.enablebanking.com/test?state=${input.state}`};}
  async complete(code:string){if(code==='FAIL')throw new BankingProviderError('provider_unavailable');return {sessionId:`session-${code}`,expiresAt:new Date(Date.now()+86400_000).toISOString(),accounts:[
    {providerAccountId:`${code}-eur`,identificationHash:`${code}-eur-hash`,name:'EUR bank',currency:'EUR'},
    {providerAccountId:`${code}-bgn`,identificationHash:`${code}-bgn-hash`,name:'BGN bank',currency:'BGN'},
  ]};}
  async sessionStatus(){return this.expired?'expired' as const:'active' as const;}
  async balance(id:string){return {amount:id.endsWith('eur')?'0.00':'100.00',currency:id.endsWith('eur')?'EUR':'BGN',asOf:null};}
  async transactions(id:string){if(this.rateLimited)throw new BankingProviderError('ASPSP_RATE_LIMIT_EXCEEDED',this.retryAfterSeconds,429);if(this.outage)throw new Error('mock outage');return {transactions:this.entries.get(id)??[],next:null};}
  async disconnect(){return;}
}

describe('banking sandbox lifecycle and financial integrity',()=>{
  let pool:pg.Pool; let app:Express; let bank:MockBank; let a:ReturnType<typeof request.agent>; let b:ReturnType<typeof request.agent>;
  let userA:string; let userB:string; let connectionId:string; let secondId:string; let eurLink:string; let bgnLink:string; let eurAccount:string;
  let secrets:BankingSecrets; let config:ReturnType<typeof loadConfig>; let cookieA:string;
  const origin='http://localhost:3000';
  beforeAll(async()=>{
    const key=Buffer.alloc(32,7).toString('base64');
    config=loadConfig({...process.env,NODE_ENV:'test',COOKIE_SECURE:'never',AUTH_RATE_LIMIT_MAX:'100',
      APP_ORIGIN:origin,BANKING_REDIRECT_URI:`${origin}/api/banking/callback`,BANKING_ENCRYPTION_KEY_B64:key,
      BANKING_SANDBOX_SYNC_INTERVAL_MINUTES:'5'});
    secrets=new BankingSecrets(key);
    pool=createPool(config.databaseUrl,3);await assertSafeRuntimeRole(pool);
    bank=new MockBank();app=createApp(pool,config,bank);a=request.agent(app);b=request.agent(app);
    const suffix=`${Date.now()}-${crypto.randomUUID()}`;
    userA=(await a.post('/api/auth/register').send({email:`bank-a-${suffix}@example.test`,password:'Correct-Horse-47!',displayName:'Bank A'}).expect(201)).body.data.user.id;
    userB=(await b.post('/api/auth/register').send({email:`bank-b-${suffix}@example.test`,password:'Correct-Horse-47!',displayName:'Bank B'}).expect(201)).body.data.user.id;
    app=createApp(pool,{...config,bankingOwnerUserId:userA},bank);
    a=request.agent(app);b=request.agent(app);
    const loginA=await a.post('/api/auth/login').send({email:`bank-a-${suffix}@example.test`,password:'Correct-Horse-47!'}).expect(200);
    cookieA=String(loginA.headers['set-cookie']?.[0] ?? '').split(';')[0]!;
    expect(cookieA).toContain('spendime_session=');
    await b.post('/api/auth/login').send({email:`bank-b-${suffix}@example.test`,password:'Correct-Horse-47!'}).expect(200);
  });
  afterAll(async()=>{if(pool){await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])',[[userA,userB].filter(Boolean)]);await pool.end();}});

  it('restricts every banking route to the configured authenticated owner',async()=>{
    expect((await a.get('/api/auth/me').expect(200)).body.data.user).toMatchObject({bankingAccess:true,bankingEnabled:true});
    expect((await b.get('/api/auth/me').expect(200)).body.data.user).toMatchObject({bankingAccess:false,bankingEnabled:false});
    const id=crypto.randomUUID();
    const routes:[string,string][]=[
      ['GET','/ai'],['PUT','/ai'],['GET','/rules'],['POST','/rules'],['DELETE',`/rules/${id}`],
      ['GET','/institutions?country=BG'],['GET','/connections'],['POST','/connections'],
      ['POST',`/connections/${id}/renew`],['GET',`/callback?state=${id}&code=CODE`],
      ['POST',`/links/${id}/link`],['POST',`/connections/${id}/sync`],
      ['GET','/review'],['GET',`/review/${id}/candidates`],['GET','/transfers/candidates'],
      ['POST',`/review/${id}/post`],['POST',`/review/${id}/match`],['POST',`/review/${id}/keep`],
      ['POST',`/links/${id}/complete-initial-review`],['POST',`/links/${id}/reconcile`],
      ['POST','/transfers/pair'],['POST',`/transactions/${id}/remember-category`],
      ['POST',`/connections/${id}/disconnect`],['DELETE',`/connections/${id}/data`],
    ];
    for(const [method,path] of routes){
      const url=`/api/banking${path}`;
      const denied=await b[method.toLowerCase() as 'get'](url).set('Origin',origin).set('X-Banking-Owner-User-ID',userA)
        .query({ownerUserId:userA}).send({ownerUserId:userA,userId:userA,connectionId:id}).expect(403);
      expect(denied.body.error.code).toBe('banking_forbidden');
      await request(app)[method.toLowerCase() as 'get'](url).set('Origin',origin).expect(401);
    }
    await b.get('/api/accounts').expect(200);
    await b.get('/api/transactions').expect(200);
    const {bankingOwnerUserId: _owner, ...missingOwnerConfig}=config;
    const absent=createApp(pool,missingOwnerConfig,bank);
    await request(absent).get('/api/banking/connections').set('Cookie',cookieA).expect(403);
    const invalid=loadConfig({...process.env,NODE_ENV:'test',BANKING_OWNER_USER_ID:'not-a-uuid',BANKING_ENCRYPTION_KEY_B64:config.bankingEncryptionKeyB64});
    await request(createApp(pool,invalid,bank)).get('/api/banking/connections').set('Cookie',cookieA).expect(403);
    const disabled=createApp(pool,{...config,nodeEnv:'production',bankingProductionEnabled:false,bankingOwnerUserId:userA},bank);
    expect((await request(disabled).get('/api/auth/me').set('Cookie',cookieA).expect(200)).body.data.user)
      .toMatchObject({bankingAccess:true,bankingEnabled:false});
    await request(disabled).get('/api/banking/connections').set('Cookie',cookieA).expect(503);
  });

  it('does not schedule another user’s pre-existing bank connection',async()=>{
    const foreign=await withUserTransaction(pool,userB,async client=>(await client.query<{id:string}>(`INSERT INTO bank_connections
      (user_id,provider,environment,institution_name,institution_country,provider_session_id,status,last_synced_at,next_sync_at)
      VALUES($1,'enable_banking','sandbox','Mock ASPSP','BG',$2,'active',now()-interval '1 hour',now()-interval '1 minute') RETURNING id`,
      [userB,secrets.encrypt('foreign-session')])).rows[0]!.id);
    expect(await rescheduleSandboxMockConnections(pool,bank,5,userA)).toBe(0);
    await syncDueConnections(pool,bank,secrets,5,userA);
    const row=await withUserTransaction(pool,userB,async client=>(await client.query(`SELECT last_synced_at,next_sync_at FROM bank_connections WHERE id=$1`,[foreign])).rows[0]);
    expect(new Date(row.last_synced_at).getTime()).toBeLessThan(Date.now());
    expect(new Date(row.next_sync_at).getTime()).toBeLessThan(Date.now());
    await withUserTransaction(pool,userB,async client=>{await client.query('DELETE FROM bank_connections WHERE id=$1',[foreign]);});
  });

  it('rejects callback state from another user and failed authorization',async()=>{
    const start=await a.post('/api/banking/connections').set('Origin',origin).send({country:'BG',name:'Mock ASPSP'}).expect(201);
    connectionId=start.body.data.connectionId;
    const state=new URL(start.body.data.authorizationUrl).searchParams.get('state')!;
    await b.get(`/api/banking/callback?state=${state}&code=A`).expect(403);
    await a.get('/api/banking/callback?state=00000000-0000-4000-8000-000000000000&code=A').expect(400);
    await a.get(`/api/banking/callback?state=${state}&error=denied`).expect(303);
    const renewed=await a.post(`/api/banking/connections/${connectionId}/renew`).set('Origin',origin).expect(200);
    const renewedState=new URL(renewed.body.data.authorizationUrl).searchParams.get('state')!;
    await a.get(`/api/banking/callback?state=${renewedState}&code=A`).expect(303);
    await a.get(`/api/banking/callback?state=${renewedState}&code=A`).expect(400);
  });

  it('links multiple accounts, imports history, and isolates users',async()=>{
    const list=await a.get('/api/banking/connections').expect(200);
    const links=list.body.data[0].accounts;
    eurLink=links.find((x:any)=>x.currency==='EUR').id;
    bgnLink=links.find((x:any)=>x.currency==='BGN').id;
    await b.post(`/api/banking/links/${eurLink}/link`).set('Origin',origin).send({accountId:null}).expect(403);
    eurAccount=(await a.post(`/api/banking/links/${eurLink}/link`).set('Origin',origin).send({accountId:null}).expect(200)).body.data.accountId;
    await a.post(`/api/banking/links/${bgnLink}/link`).set('Origin',origin).send({accountId:null}).expect(200);
    const ordinaryAccount=(await b.post('/api/accounts').send({name:'Ordinary user cash',kind:'cash',currency:'EUR',openingBalance:'12.00'}).expect(201)).body.data.id;
    expect((await b.get('/api/accounts').expect(200)).body.data.map((item:any)=>item.id)).not.toContain(eurAccount);
    expect((await a.get('/api/accounts').expect(200)).body.data.map((item:any)=>item.id)).not.toContain(ordinaryAccount);
    await b.get(`/api/accounts/${eurAccount}`).expect(404);
    bank.entries.set('A-eur',[tx('expense-1','debit','20.00','EUR','Shop'),tx('pending-1','debit','7.00','EUR','Taxi','PDNG'),tx('refund-1','credit','5.00','EUR','Shop')]);
    bank.entries.set('A-bgn',[tx('expense-bgn','debit','10.00','BGN','Market')]);
    await a.post(`/api/banking/connections/${connectionId}/sync`).set('Origin',origin).expect(200);
    const count=await withUserTransaction(pool,userA,async(client)=>(await client.query(`SELECT count(*)::integer AS n FROM bank_transactions WHERE status='BOOK' AND match_status='posted'`)).rows[0].n);
    expect(count).toBe(3);
    const dashboard=await a.get(`/api/dashboard?timeframe=daily&anchor=${today}`).expect(200);
    expect(Number(dashboard.body.data.cashFlow.find((x:any)=>x.currency==='EUR')?.actualSpending)).toBe(15);
    expect(Number(dashboard.body.data.cashFlow.find((x:any)=>x.currency==='EUR')?.actualIncome)).toBe(0);
    expect(Number(dashboard.body.data.cashFlow.find((x:any)=>x.currency==='BGN')?.actualSpending)).toBe(10);
    expect(Number((await a.get(`/api/accounts/${eurAccount}`).expect(200)).body.data.currentBalance)).toBe(-15);
    await b.get('/api/banking/connections').expect(403);
  });

  it('rejects duplicate bank accounts and unsafe live-balance calibration',async()=>{
    await a.post(`/api/banking/links/${eurLink}/reconcile`).set('Origin',origin).expect(409)
      .expect(({body})=>expect(body.error.code).toBe('balance_review_required'));
    const start=await a.post('/api/banking/connections').set('Origin',origin).send({country:'BG',name:'Mock ASPSP'}).expect(201);
    const state=new URL(start.body.data.authorizationUrl).searchParams.get('state')!;
    await a.get(`/api/banking/callback?state=${state}&code=A`).expect(409)
      .expect(({body})=>expect(body.error.code).toBe('bank_account_already_connected'));
    const failed = (await a.get('/api/banking/connections').expect(200)).body.data
      .find((item:any)=>item.id===start.body.data.connectionId);
    expect(failed).toMatchObject({status:'error',errorCode:'bank_account_already_connected'});
    await a.get(`/api/banking/callback?state=${state}&code=A`).expect(400);
    await withUserTransaction(pool,userA,client=>client.query('DELETE FROM bank_connections WHERE id=$1',[start.body.data.connectionId]));
    const renewed=await a.post(`/api/banking/connections/${connectionId}/renew`).set('Origin',origin).expect(200);
    const renewedState=new URL(renewed.body.data.authorizationUrl).searchParams.get('state')!;
    const responses=await Promise.all([a.get(`/api/banking/callback?state=${renewedState}&code=A`),a.get(`/api/banking/callback?state=${renewedState}&code=A`)]);
    expect(responses.map(r=>r.status).sort()).toEqual([303,400]);
    expect((await a.get(`/api/accounts/${eurAccount}`)).body.data.currentBalance).toBe('-15.0000');
    await a.post(`/api/banking/connections/${connectionId}/sync`).set('Origin',origin).expect(200);
  });

  it('records exchange failures without allowing authorization replay',async()=>{
    const start=await a.post('/api/banking/connections').set('Origin',origin).send({country:'BG',name:'Mock ASPSP'}).expect(201);
    const state=new URL(start.body.data.authorizationUrl).searchParams.get('state')!;
    await a.get(`/api/banking/callback?state=${state}&code=FAIL`).expect(502);
    const failed=(await a.get('/api/banking/connections').expect(200)).body.data.find((item:any)=>item.id===start.body.data.connectionId);
    expect(failed).toMatchObject({status:'error',errorCode:'authorization_exchange_failed'});
    await a.get(`/api/banking/callback?state=${state}&code=FAIL`).expect(400);
    await withUserTransaction(pool,userA,client=>client.query('DELETE FROM bank_connections WHERE id=$1',[start.body.data.connectionId]));
  });

  it('schedules only sandbox Mock ASPSP at five minutes and serializes manual syncs',async()=>{
    const schedule=await withUserTransaction(pool,userA,async client=>(await client.query(`SELECT last_synced_at,next_sync_at FROM bank_connections WHERE id=$1`,[connectionId])).rows[0]);
    expect(new Date(schedule.next_sync_at).getTime()-new Date(schedule.last_synced_at).getTime()).toBe(5*60_000);
    await withUserTransaction(pool,userA,async client=>{await client.query(`UPDATE bank_connections SET next_sync_at=last_synced_at+interval '6 hours' WHERE id=$1`,[connectionId]);});
    expect(await rescheduleSandboxMockConnections(pool,bank,5,userA)).toBe(1);
    const shortened=await withUserTransaction(pool,userA,async client=>(await client.query(`SELECT last_synced_at,next_sync_at FROM bank_connections WHERE id=$1`,[connectionId])).rows[0]);
    expect(new Date(shortened.next_sync_at).getTime()-new Date(shortened.last_synced_at).getTime()).toBe(5*60_000);
    await withUserTransaction(pool,userA,async client=>{await client.query(`UPDATE bank_connections SET next_sync_at=now()-interval '1 second' WHERE id=$1`,[connectionId]);});
    const held=await pool.connect();
    try {
      expect((await held.query(`SELECT pg_try_advisory_lock(hashtextextended($1::text,0)) AS locked`,[connectionId])).rows[0].locked).toBe(true);
      await a.post(`/api/banking/connections/${connectionId}/sync`).set('Origin',origin).expect(409)
        .expect(({body})=>expect(body.error.code).toBe('sync_in_progress'));
    } finally {
      await held.query(`SELECT pg_advisory_unlock(hashtextextended($1::text,0))`,[connectionId]);
      held.release();
    }
    await a.post(`/api/banking/connections/${connectionId}/sync`).set('Origin',origin).expect(200);
  });

  it('incrementally books pending entries once and preserves a corrected category',async()=>{
    bank.entries.set('A-eur',[tx('expense-1','debit','20.00','EUR','Shop'),tx('pending-1','debit','7.00','EUR','Taxi'),tx('refund-1','credit','5.00','EUR','Shop')]);
    await syncConnection(pool,bank,secrets,userA,connectionId,true);
    await syncConnection(pool,bank,secrets,userA,connectionId,true);
    const posted=await withUserTransaction(pool,userA,async(client)=>(await client.query(`SELECT count(*)::integer AS n FROM bank_transactions WHERE entry_reference='pending-1' AND match_status='posted'`)).rows[0].n);
    expect(posted).toBe(1);
    const txId=await withUserTransaction(pool,userA,async(client)=>(await client.query(`SELECT ledger_transaction_id AS id FROM bank_transactions WHERE entry_reference='pending-1'`)).rows[0].id);
    expect((await a.get(`/api/transactions/${txId}`).expect(200)).body.data.categoryId).toBeNull();
    const categories=(await a.get('/api/categories').expect(200)).body.data;
    const categoryId=categories.find((x:any)=>x.name==='Food').id;
    await a.patch(`/api/transactions/${txId}`).send({categoryId,description:'Corrected taxi note'}).expect(200);
    await syncConnection(pool,bank,secrets,userA,connectionId,true);
    const corrected=await a.get(`/api/transactions/${txId}`).expect(200);
    expect(corrected.body.data).toMatchObject({categoryId,categoryLocked:true,description:'Corrected taxi note'});
  });

  it('keeps a second connected institution separate for the same user',async()=>{
    const start=await a.post('/api/banking/connections').set('Origin',origin).send({country:'BG',name:'Second Test Bank'}).expect(201);
    secondId=start.body.data.connectionId;
    const state=new URL(start.body.data.authorizationUrl).searchParams.get('state')!;
    await a.get(`/api/banking/callback?state=${state}&code=SECOND`).expect(303);
    const list=(await a.get('/api/banking/connections').expect(200)).body.data;
    expect(list).toHaveLength(2);
    expect(new Set(list.map((x:any)=>x.institutionName)).size).toBe(2);
    await b.get('/api/banking/connections').expect(403);
  });

  it('pairs different currency legs without counting them as spending or income',async()=>{
    bank.entries.set('A-eur',[...(bank.entries.get('A-eur')??[]),tx('fx-out','debit','30.00','EUR','Own transfer')]);
    bank.entries.set('A-bgn',[...(bank.entries.get('A-bgn')??[]),tx('fx-in','credit','60.00','BGN','Own transfer')]);
    await syncConnection(pool,bank,secrets,userA,connectionId,true);
    const [debitId,creditId]=await withUserTransaction(pool,userA,async(client)=>{
      const rows=(await client.query(`SELECT id,entry_reference FROM bank_transactions WHERE entry_reference IN ('fx-out','fx-in')`)).rows;
      return [rows.find(x=>x.entry_reference==='fx-out').id,rows.find(x=>x.entry_reference==='fx-in').id];
    });
    const balancesBefore=new Map((await a.get('/api/accounts').expect(200)).body.data.map((item:any)=>[item.id,item.currentBalance]));
    await a.post('/api/banking/transfers/pair').set('Origin',origin).send({debitId,creditId}).expect(200)
      .expect(({body})=>expect(body.data.crossCurrency).toBe(true));
    const balancesAfter=new Map((await a.get('/api/accounts').expect(200)).body.data.map((item:any)=>[item.id,item.currentBalance]));
    expect(balancesAfter).toEqual(balancesBefore);
    const linkedLegs=await withUserTransaction(pool,userA,async client=>(await client.query(`SELECT bt.entry_reference,bt.amount,bt.currency,t.kind
      FROM bank_transactions bt JOIN transactions t ON t.id=bt.ledger_transaction_id WHERE bt.id IN ($1,$2)`,[debitId,creditId])).rows);
    expect(linkedLegs).toEqual(expect.arrayContaining([
      expect.objectContaining({entry_reference:'fx-out',amount:'30.0000',currency:'EUR',kind:'adjustment'}),
      expect.objectContaining({entry_reference:'fx-in',amount:'60.0000',currency:'BGN',kind:'adjustment'}),
    ]));
    const dashboard=await a.get(`/api/dashboard?timeframe=daily&anchor=${today}`).expect(200);
    expect(Number(dashboard.body.data.cashFlow.find((x:any)=>x.currency==='EUR')?.actualSpending)).toBe(22);
    expect(Number(dashboard.body.data.cashFlow.find((x:any)=>x.currency==='BGN')?.actualIncome)).toBe(0);
  });

  it('pairs equal-currency bank legs as one transfer without changing balances',async()=>{
    const secondLink=(await a.get('/api/banking/connections').expect(200)).body.data.find((item:any)=>item.id===secondId).accounts.find((item:any)=>item.currency==='EUR').id;
    await a.post(`/api/banking/links/${secondLink}/link`).set('Origin',origin).send({accountId:null}).expect(200);
    bank.entries.set('A-eur',[...(bank.entries.get('A-eur')??[]),tx('same-out','debit','4.00','EUR','Own transfer')]);
    bank.entries.set('SECOND-eur',[tx('same-in','credit','4.00','EUR','Own transfer')]);
    await syncConnection(pool,bank,secrets,userA,connectionId,true);
    await syncConnection(pool,bank,secrets,userA,secondId,true);
    const legs=await withUserTransaction(pool,userA,async client=>(await client.query(`SELECT id,entry_reference FROM bank_transactions WHERE entry_reference IN ('same-out','same-in')`)).rows);
    const debitId=legs.find(item=>item.entry_reference==='same-out').id;
    const creditId=legs.find(item=>item.entry_reference==='same-in').id;
    const before=new Map((await a.get('/api/accounts').expect(200)).body.data.map((item:any)=>[item.id,item.currentBalance]));
    await a.post('/api/banking/transfers/pair').set('Origin',origin).send({debitId,creditId}).expect(200).expect(({body})=>expect(body.data.crossCurrency).toBe(false));
    const after=new Map((await a.get('/api/accounts').expect(200)).body.data.map((item:any)=>[item.id,item.currentBalance]));
    expect(after).toEqual(before);
    const pair=await withUserTransaction(pool,userA,async client=>(await client.query(`SELECT debit.ledger_transaction_id AS debit,credit.ledger_transaction_id AS credit,t.kind,t.amount,t.currency
      FROM bank_transactions debit JOIN bank_transactions credit ON credit.id=$2 JOIN transactions t ON t.id=debit.ledger_transaction_id WHERE debit.id=$1`,[debitId,creditId])).rows[0]);
    expect(pair).toMatchObject({credit:pair.debit,kind:'transfer',amount:'4.0000',currency:'EUR'});
  });

  it('defers on rate limits, survives outages, and reverses cancelled bank entries',async()=>{
    bank.rateLimited=true;bank.retryAfterSeconds=8*3600;
    await syncConnection(pool,bank,secrets,userA,connectionId,true);
    const limited=(await a.get('/api/banking/connections').expect(200)).body.data.find((x:any)=>x.id===connectionId);
    expect(limited.errorCode).toBe('rate_limited');
    expect(new Date(limited.nextSyncAt).getTime()-Date.now()).toBeGreaterThan(7*3600_000);
    expect(await rescheduleSandboxMockConnections(pool,bank,5,userA)).toBe(0);
    bank.rateLimited=false;bank.retryAfterSeconds=0;bank.outage=true;
    await expect(syncConnection(pool,bank,secrets,userA,connectionId,true)).rejects.toThrow('mock outage');
    expect((await a.get('/api/banking/connections').expect(200)).body.data.find((x:any)=>x.id===connectionId).errorCode).toBe('sync_failed');
    bank.outage=false;
    bank.entries.set('A-bgn',[tx('expense-bgn','debit','10.00','BGN','Market','CNCL'),tx('fx-in','credit','60.00','BGN','Own transfer')]);
    await syncConnection(pool,bank,secrets,userA,connectionId,true);
    const dashboard=await a.get(`/api/dashboard?timeframe=daily&anchor=${today}`).expect(200);
    expect(Number(dashboard.body.data.cashFlow.find((x:any)=>x.currency==='BGN')?.actualSpending)).toBe(0);
  });

  it('keeps new imports uncategorized even when an old merchant rule exists',async()=>{
    const categoryId=(await a.get('/api/categories').expect(200)).body.data.find((x:any)=>x.name==='Food').id;
    const ruleId=(await a.post('/api/banking/rules').set('Origin',origin).send({merchant:'Market',direction:'debit',categoryId}).expect(201)).body.data.id;
    await b.delete(`/api/banking/rules/${ruleId}`).set('Origin',origin).expect(403);
    bank.entries.set('A-bgn',[...(bank.entries.get('A-bgn')??[]),tx('rule-new','debit','2.00','BGN','Market')]);
    await syncConnection(pool,bank,secrets,userA,connectionId,true);
    const category=await withUserTransaction(pool,userA,async(client)=>(await client.query(`SELECT t.category_id AS id
      FROM bank_transactions bt JOIN transactions t ON t.id=bt.ledger_transaction_id
      WHERE bt.entry_reference='rule-new'`)).rows[0]?.id);
    expect(category).toBeNull();
    await a.delete(`/api/banking/rules/${ruleId}`).set('Origin',origin).expect(204);
  });

  it('requires historical reconciliation on an existing account, then posts only genuinely later bookings',async()=>{
    const manualAccount=(await a.post('/api/accounts').send({name:'Manual history',kind:'checking',currency:'EUR',openingBalance:'100.00'}).expect(201)).body.data.id;
    const manual=(await a.post('/api/transactions').send({kind:'expense',sourceAccountId:manualAccount,amount:'10.00',currency:'EUR',occurredAt:`${today}T12:00:00.000Z`,description:'Historical grocery'}).expect(201)).body.data.id;
    const start=await a.post('/api/banking/connections').set('Origin',origin).send({country:'BG',name:'Mock ASPSP'}).expect(201);
    const state=new URL(start.body.data.authorizationUrl).searchParams.get('state')!;
    await a.get(`/api/banking/callback?state=${state}&code=HIST`).expect(303);
    const historyConnection=start.body.data.connectionId;
    const historyLink=(await a.get('/api/banking/connections').expect(200)).body.data.find((x:any)=>x.id===historyConnection).accounts.find((x:any)=>x.currency==='EUR').id;
    bank.entries.set('HIST-eur',[tx('manual-existing','debit','10.00','EUR','Grocery'),tx('historical-unmatched','credit','4.00','EUR','Employer')]);
    await a.post(`/api/banking/links/${historyLink}/link`).set('Origin',origin).send({accountId:manualAccount}).expect(200);
    await syncConnection(pool,bank,secrets,userA,historyConnection,true);
    let review=(await a.get('/api/banking/review').expect(200)).body.data.filter((x:any)=>x.bankAccountLinkId===historyLink);
    expect(review).toHaveLength(2);
    expect((await a.get('/api/banking/connections').expect(200)).body.data.find((x:any)=>x.id===historyConnection).accounts.find((x:any)=>x.id===historyLink).reviewCount).toBe(2);
    expect((await a.get('/api/transactions?limit=100').expect(200)).body.data.find((x:any)=>x.id===manual)).toBeTruthy();
    await b.post(`/api/banking/links/${historyLink}/complete-initial-review`).set('Origin',origin).expect(403);
    await a.post(`/api/banking/links/${historyLink}/complete-initial-review`).set('Origin',origin).expect(409);
    const manualBankId=await withUserTransaction(pool,userA,async client=>(await client.query(`SELECT id FROM bank_transactions WHERE entry_reference='manual-existing'`)).rows[0].id);
    await a.post(`/api/banking/review/${manualBankId}/match`).set('Origin',origin).send({transactionId:manual}).expect(200);
    const unmatched=review.find((x:any)=>x.description==='Employer');
    await a.post(`/api/banking/review/${unmatched.id}/post`).set('Origin',origin).expect(200);
    await a.post(`/api/banking/links/${historyLink}/complete-initial-review`).set('Origin',origin).expect(200);
    await withUserTransaction(pool,userA,async client=>{await client.query(`UPDATE users SET timezone='Pacific/Kiritimati' WHERE id=$1`,[userA]);});
    const afterDate=new Date(Date.now()+2*86400_000).toISOString().slice(0,10);
    const futureManual=(await a.post('/api/transactions').send({kind:'expense',sourceAccountId:manualAccount,amount:'8.00',currency:'EUR',occurredAt:new Date(`${afterDate}T12:00:00+14:00`).toISOString(),description:'Manually entered future purchase'}).expect(201)).body.data.id;
    bank.entries.set('HIST-eur',[...(bank.entries.get('HIST-eur')??[]),{...tx('later-booked','debit','6.00','EUR','Coffee'),occurredOn:afterDate},{...tx('possible-duplicate','debit','8.00','EUR','Shop'),occurredOn:afterDate},tx('same-day-late','debit','2.00','EUR','Old invoice'),{...tx('later-pending','credit','3.00','EUR','Employer','PDNG'),occurredOn:afterDate}]);
    await syncConnection(pool,bank,secrets,userA,historyConnection,true);
    await syncConnection(pool,bank,secrets,userA,historyConnection,true);
    const statuses=await withUserTransaction(pool,userA,async client=>(await client.query(`SELECT id,entry_reference,match_status,ledger_transaction_id FROM bank_transactions WHERE bank_account_link_id=$1`,[historyLink])).rows);
    expect(statuses.find(x=>x.entry_reference==='later-booked')?.match_status).toBe('posted');
    expect(statuses.find(x=>x.entry_reference==='possible-duplicate')?.match_status).toBe('review');
    expect((await a.get(`/api/transactions/${futureManual}`).expect(200)).body.data.voidedAt).toBeNull();
    expect(statuses.find(x=>x.entry_reference==='same-day-late')?.match_status).toBe('review');
    expect(statuses.find(x=>x.entry_reference==='later-pending')?.ledger_transaction_id).toBeNull();
    const bookedId=statuses.find(x=>x.entry_reference==='later-booked')?.ledger_transaction_id;
    const booked=(await a.get(`/api/transactions/${bookedId}`).expect(200)).body.data;
    expect(booked).toMatchObject({categoryId:null,bankOccurredOn:afterDate,kind:'expense',amount:'6.0000',currency:'EUR'});
    expect(new Intl.DateTimeFormat('en-CA',{timeZone:'Pacific/Kiritimati',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(booked.occurredAt))).toBe(afterDate);
    const editedDate=new Date(Date.parse(`${afterDate}T00:00:00Z`)+86400_000).toISOString().slice(0,10);
    const editedAt=new Date(`${editedDate}T12:00:00+14:00`).toISOString();
    await a.patch(`/api/transactions/${bookedId}`).send({occurredAt:editedAt,description:'Corrected bank note'}).expect(200);
    bank.entries.set('HIST-eur',(bank.entries.get('HIST-eur')??[]).map(item=>item.entryReference==='later-pending'?{...item,status:'BOOK'}:item));
    await syncConnection(pool,bank,secrets,userA,historyConnection,true);
    expect((await withUserTransaction(pool,userA,async client=>(await client.query(`SELECT count(*)::integer AS count FROM bank_transactions WHERE entry_reference='later-pending' AND match_status='posted'`)).rows[0].count))).toBe(1);
    expect((await a.get(`/api/transactions/${bookedId}`).expect(200)).body.data).toMatchObject({occurredAt:editedAt,bankOccurredOn:null,description:'Corrected bank note'});
    review=(await a.get('/api/banking/review').expect(200)).body.data.filter((x:any)=>x.bankAccountLinkId===historyLink);
    expect(review.map((x:any)=>x.id)).toContain(statuses.find(x=>x.entry_reference==='same-day-late')?.id);
    await withUserTransaction(pool,userA,async client=>{await client.query(`UPDATE users SET timezone='UTC' WHERE id=$1`,[userA]);});
    await a.post(`/api/banking/connections/${historyConnection}/disconnect`).set('Origin',origin).expect(204);
    await a.delete(`/api/banking/connections/${historyConnection}/data`).set('Origin',origin).expect(204);
  });

  it('expires consent and disconnects without deleting imported ledger entries',async()=>{
    bank.expired=true;
    await syncConnection(pool,bank,secrets,userA,connectionId,true);
    const list=await a.get('/api/banking/connections').expect(200);
    expect(list.body.data.find((x:any)=>x.id===connectionId).status).toBe('expired');
    const before=await a.get('/api/transactions?limit=100').expect(200);
    await a.post(`/api/banking/connections/${connectionId}/disconnect`).set('Origin',origin).expect(204);
    expect((await a.get('/api/banking/connections').expect(200)).body.data.find((x:any)=>x.id===connectionId).status).toBe('disconnected');
    await a.delete(`/api/banking/connections/${connectionId}/data`).set('Origin',origin).expect(204);
    expect((await a.get('/api/banking/connections').expect(200)).body.data).toHaveLength(1);
    await a.post(`/api/banking/connections/${secondId}/disconnect`).set('Origin',origin).expect(204);
    await a.delete(`/api/banking/connections/${secondId}/data`).set('Origin',origin).expect(204);
    expect((await a.get('/api/banking/connections').expect(200)).body.data).toEqual([]);
    const after=await a.get('/api/transactions?limit=100').expect(200);
    expect(after.body.meta.total).toBe(before.body.meta.total);
  });

  it('keeps mocked production history in review until the owner completes initial reconciliation',async()=>{
    const productionOrigin='https://spendime.example.test';
    const productionKey=Buffer.alloc(32,8).toString('base64');
    const productionSecrets=new BankingSecrets(productionKey);
    const productionBank:BankingProvider={
      id:'enable_banking', environment:'production',
      institutions:country=>bank.institutions(country),
      begin:input=>bank.begin(input), complete:code=>bank.complete(code),
      sessionStatus:id=>bank.sessionStatus(), balance:id=>bank.balance(id),
      transactions:(id,options)=>bank.transactions(id), disconnect:id=>bank.disconnect(),
    };
    bank.expired=false;
    const productionConfig={...config,nodeEnv:'production' as const,bankingProductionEnabled:true,bankingOwnerUserId:userA,
      bankingProductionEncryptionKeyB64:productionKey,
      bankingProductionRedirectUri:`${productionOrigin}/api/banking/callback`,appOrigin:productionOrigin};
    const productionApp=createApp(pool,productionConfig,productionBank);
    const start=await request(productionApp).post('/api/banking/connections')
      .set('Cookie',cookieA).set('Origin',productionOrigin)
      .send({country:'BG',name:'Mock ASPSP'}).expect(201);
    const state=new URL(start.body.data.authorizationUrl).searchParams.get('state');
    await request(productionApp).get(`/api/banking/callback?state=${state}&code=PROD`)
      .set('Cookie',cookieA).expect(303);
    const connectionId=start.body.data.connectionId;
    const sandboxConnectionId=await withUserTransaction(pool,userA,async client=>(await client.query<{id:string}>(
      `INSERT INTO bank_connections(user_id,provider,environment,institution_name,institution_country)
       VALUES($1,'enable_banking','sandbox','Mock ASPSP','BG') RETURNING id`,[userA])).rows[0]!.id);
    const list=await request(productionApp).get('/api/banking/connections').set('Cookie',cookieA).expect(200);
    expect(list.body.data).toHaveLength(1);
    await request(productionApp).post(`/api/banking/connections/${sandboxConnectionId}/renew`)
      .set('Cookie',cookieA).set('Origin',productionOrigin).expect(404);
    const linkId=list.body.data[0].accounts.find((item:any)=>item.currency==='EUR').id;
    bank.entries.set('PROD-eur',[tx('production-history','debit','12.00','EUR','Store')]);
    await request(productionApp).post(`/api/banking/links/${linkId}/link`)
      .set('Cookie',cookieA).set('Origin',productionOrigin).send({accountId:null}).expect(200);
    await syncConnection(pool,productionBank,productionSecrets,userA,connectionId,true);
    const staged=await withUserTransaction(pool,userA,async client=>(await client.query(
      `SELECT id,match_status,ledger_transaction_id FROM bank_transactions WHERE entry_reference='production-history'`)).rows[0]);
    expect(staged).toMatchObject({match_status:'review',ledger_transaction_id:null});
    await request(productionApp).post(`/api/banking/links/${linkId}/complete-initial-review`)
      .set('Cookie',cookieA).set('Origin',productionOrigin).expect(409);
    await request(productionApp).post(`/api/banking/review/${staged.id}/post`)
      .set('Cookie',cookieA).set('Origin',productionOrigin).expect(200);
    await request(productionApp).post(`/api/banking/links/${linkId}/complete-initial-review`)
      .set('Cookie',cookieA).set('Origin',productionOrigin).expect(200);
    const future=new Date(Date.now()+2*86400_000).toISOString().slice(0,10);
    bank.entries.set('PROD-eur',[tx('production-history','debit','12.00','EUR','Store'),
      {...tx('production-future','credit','5.00','EUR','Payer'),occurredOn:future}]);
    await syncConnection(pool,productionBank,productionSecrets,userA,connectionId,true);
    const result=await withUserTransaction(pool,userA,async client=>(await client.query(
      `SELECT bt.match_status,t.kind,t.category_id FROM bank_transactions bt
       JOIN transactions t ON t.id=bt.ledger_transaction_id WHERE bt.entry_reference='production-future'`)).rows[0]);
    expect(result).toMatchObject({match_status:'posted',kind:'income',category_id:null});
    await withUserTransaction(pool,userA,async client=>{await client.query('DELETE FROM bank_connections WHERE id=$1',[sandboxConnectionId]);});
  });
});
