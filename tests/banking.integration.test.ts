import type { Express } from 'express';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { assertSafeRuntimeRole, createPool } from '../src/server/db/pool.js';
import { withUserTransaction } from '../src/server/db/transactions.js';
import type { BankTransaction, BankingProvider } from '../src/server/domains/banking/provider.js';
import { syncConnection } from '../src/server/domains/banking/sync.js';
import { BankingSecrets } from '../src/server/domains/banking/secrets.js';
import { BankingProviderError } from '../src/server/domains/banking/provider.js';

const today=new Date().toISOString().slice(0,10);
const tx=(reference:string,direction:'debit'|'credit',amount:string,currency:string,merchant:string,status='BOOK'):BankTransaction=>({
  entryReference:reference,direction,amount,currency,merchant,status,occurredOn:today,
  description:reference.startsWith('refund')?`Refund ${merchant}`:merchant,counterpartyHash:null,
});
class MockBank implements BankingProvider {
  readonly id='mock'; readonly environment='sandbox' as const;
  entries=new Map<string,BankTransaction[]>();
  expired=false; outage=false;
  rateLimited=false;
  async institutions(country:string){return ['Mock ASPSP','Second Test Bank'].map(name=>({name,country,beta:false,maximumConsentValiditySeconds:86400}));}
  async begin(input:{state:string}){return {url:`https://auth.enablebanking.com/test?state=${input.state}`};}
  async complete(code:string){return {sessionId:`session-${code}`,expiresAt:new Date(Date.now()+86400_000).toISOString(),accounts:[
    {providerAccountId:`${code}-eur`,identificationHash:`${code}-eur-hash`,name:'EUR bank',currency:'EUR'},
    {providerAccountId:`${code}-bgn`,identificationHash:`${code}-bgn-hash`,name:'BGN bank',currency:'BGN'},
  ]};}
  async sessionStatus(){return this.expired?'expired' as const:'active' as const;}
  async balance(id:string){return {amount:id.endsWith('eur')?'0.00':'100.00',currency:id.endsWith('eur')?'EUR':'BGN',asOf:null};}
  async transactions(id:string){if(this.rateLimited)throw new BankingProviderError('RATE_LIMIT_EXCEEDED');if(this.outage)throw new Error('mock outage');return {transactions:this.entries.get(id)??[],next:null};}
  async disconnect(){return;}
}

describe('banking sandbox lifecycle and financial integrity',()=>{
  let pool:pg.Pool; let app:Express; let bank:MockBank; let a:ReturnType<typeof request.agent>; let b:ReturnType<typeof request.agent>;
  let userA:string; let userB:string; let connectionId:string; let secondId:string; let eurLink:string; let bgnLink:string; let eurAccount:string;
  let secrets:BankingSecrets;
  const origin='http://localhost:3000';
  beforeAll(async()=>{
    const key=Buffer.alloc(32,7).toString('base64');
    const config=loadConfig({...process.env,NODE_ENV:'test',COOKIE_SECURE:'never',AUTH_RATE_LIMIT_MAX:'100',
      APP_ORIGIN:origin,BANKING_REDIRECT_URI:`${origin}/api/banking/callback`,BANKING_ENCRYPTION_KEY_B64:key});
    secrets=new BankingSecrets(key);
    pool=createPool(config.databaseUrl,3);await assertSafeRuntimeRole(pool);
    bank=new MockBank();app=createApp(pool,config,bank);a=request.agent(app);b=request.agent(app);
    const suffix=`${Date.now()}-${crypto.randomUUID()}`;
    userA=(await a.post('/api/auth/register').send({email:`bank-a-${suffix}@example.test`,password:'Correct-Horse-47!',displayName:'Bank A'}).expect(201)).body.data.user.id;
    userB=(await b.post('/api/auth/register').send({email:`bank-b-${suffix}@example.test`,password:'Correct-Horse-47!',displayName:'Bank B'}).expect(201)).body.data.user.id;
  });
  afterAll(async()=>{if(pool){await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])',[[userA,userB].filter(Boolean)]);await pool.end();}});

  it('rejects callback state from another user and failed authorization',async()=>{
    const start=await a.post('/api/banking/connections').set('Origin',origin).send({country:'BG',name:'Mock ASPSP'}).expect(201);
    connectionId=start.body.data.connectionId;
    const state=new URL(start.body.data.authorizationUrl).searchParams.get('state')!;
    await b.get(`/api/banking/callback?state=${state}&code=A`).expect(400);
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
    await b.post(`/api/banking/links/${eurLink}/link`).set('Origin',origin).send({accountId:null}).expect(404);
    eurAccount=(await a.post(`/api/banking/links/${eurLink}/link`).set('Origin',origin).send({accountId:null}).expect(200)).body.data.accountId;
    await a.post(`/api/banking/links/${bgnLink}/link`).set('Origin',origin).send({accountId:null}).expect(200);
    bank.entries.set('A-eur',[tx('expense-1','debit','20.00','EUR','Shop'),tx('pending-1','debit','7.00','EUR','Taxi','PDNG'),tx('refund-1','credit','5.00','EUR','Shop')]);
    bank.entries.set('A-bgn',[tx('expense-bgn','debit','10.00','BGN','Market')]);
    await a.post(`/api/banking/connections/${connectionId}/sync`).set('Origin',origin).expect(200);
    const count=await withUserTransaction(pool,userA,async(client)=>(await client.query(`SELECT count(*)::integer AS n FROM bank_transactions WHERE status='BOOK' AND match_status='posted'`)).rows[0].n);
    expect(count).toBe(3);
    const dashboard=await a.get(`/api/dashboard?timeframe=daily&anchor=${today}`).expect(200);
    expect(Number(dashboard.body.data.cashFlow.find((x:any)=>x.currency==='EUR')?.actualSpending)).toBe(15);
    expect(Number(dashboard.body.data.cashFlow.find((x:any)=>x.currency==='EUR')?.actualIncome)).toBe(0);
    expect(Number(dashboard.body.data.cashFlow.find((x:any)=>x.currency==='BGN')?.actualSpending)).toBe(10);
    expect((await b.get('/api/banking/connections').expect(200)).body.data).toEqual([]);
  });

  it('incrementally books pending entries once and preserves a corrected category',async()=>{
    bank.entries.set('A-eur',[tx('expense-1','debit','20.00','EUR','Shop'),tx('pending-1','debit','7.00','EUR','Taxi'),tx('refund-1','credit','5.00','EUR','Shop')]);
    await syncConnection(pool,bank,secrets,userA,connectionId,true);
    await syncConnection(pool,bank,secrets,userA,connectionId,true);
    const posted=await withUserTransaction(pool,userA,async(client)=>(await client.query(`SELECT count(*)::integer AS n FROM bank_transactions WHERE entry_reference='pending-1' AND match_status='posted'`)).rows[0].n);
    expect(posted).toBe(1);
    const txId=await withUserTransaction(pool,userA,async(client)=>(await client.query(`SELECT ledger_transaction_id AS id FROM bank_transactions WHERE entry_reference='pending-1'`)).rows[0].id);
    const categories=(await a.get('/api/categories').expect(200)).body.data;
    const categoryId=categories.find((x:any)=>x.name==='Food').id;
    await a.patch(`/api/transactions/${txId}`).send({categoryId}).expect(200);
    await syncConnection(pool,bank,secrets,userA,connectionId,true);
    const corrected=await a.get(`/api/transactions/${txId}`).expect(200);
    expect(corrected.body.data).toMatchObject({categoryId,categoryLocked:true});
  });

  it('keeps a second connected institution separate for the same user',async()=>{
    const start=await a.post('/api/banking/connections').set('Origin',origin).send({country:'BG',name:'Second Test Bank'}).expect(201);
    secondId=start.body.data.connectionId;
    const state=new URL(start.body.data.authorizationUrl).searchParams.get('state')!;
    await a.get(`/api/banking/callback?state=${state}&code=SECOND`).expect(303);
    const list=(await a.get('/api/banking/connections').expect(200)).body.data;
    expect(list).toHaveLength(2);
    expect(new Set(list.map((x:any)=>x.institutionName)).size).toBe(2);
    expect((await b.get('/api/banking/connections').expect(200)).body.data).toEqual([]);
  });

  it('pairs different currency legs without counting them as spending or income',async()=>{
    bank.entries.set('A-eur',[...(bank.entries.get('A-eur')??[]),tx('fx-out','debit','30.00','EUR','Own transfer')]);
    bank.entries.set('A-bgn',[...(bank.entries.get('A-bgn')??[]),tx('fx-in','credit','60.00','BGN','Own transfer')]);
    await syncConnection(pool,bank,secrets,userA,connectionId,true);
    const [debitId,creditId]=await withUserTransaction(pool,userA,async(client)=>{
      const rows=(await client.query(`SELECT id,entry_reference FROM bank_transactions WHERE entry_reference IN ('fx-out','fx-in')`)).rows;
      return [rows.find(x=>x.entry_reference==='fx-out').id,rows.find(x=>x.entry_reference==='fx-in').id];
    });
    await a.post('/api/banking/transfers/pair').set('Origin',origin).send({debitId,creditId}).expect(200)
      .expect(({body})=>expect(body.data.crossCurrency).toBe(true));
    const dashboard=await a.get(`/api/dashboard?timeframe=daily&anchor=${today}`).expect(200);
    expect(Number(dashboard.body.data.cashFlow.find((x:any)=>x.currency==='EUR')?.actualSpending)).toBe(22);
    expect(Number(dashboard.body.data.cashFlow.find((x:any)=>x.currency==='BGN')?.actualIncome)).toBe(0);
  });

  it('defers on rate limits, survives outages, and reverses cancelled bank entries',async()=>{
    bank.rateLimited=true;
    await syncConnection(pool,bank,secrets,userA,connectionId,true);
    expect((await a.get('/api/banking/connections').expect(200)).body.data.find((x:any)=>x.id===connectionId).errorCode).toBe('rate_limited');
    bank.rateLimited=false;bank.outage=true;
    await expect(syncConnection(pool,bank,secrets,userA,connectionId,true)).rejects.toThrow('mock outage');
    expect((await a.get('/api/banking/connections').expect(200)).body.data.find((x:any)=>x.id===connectionId).errorCode).toBe('sync_failed');
    bank.outage=false;
    bank.entries.set('A-bgn',[tx('expense-bgn','debit','10.00','BGN','Market','CNCL'),tx('fx-in','credit','60.00','BGN','Own transfer')]);
    await syncConnection(pool,bank,secrets,userA,connectionId,true);
    const dashboard=await a.get(`/api/dashboard?timeframe=daily&anchor=${today}`).expect(200);
    expect(Number(dashboard.body.data.cashFlow.find((x:any)=>x.currency==='BGN')?.actualSpending)).toBe(0);
  });

  it('uses an explicit user rule for a later import without sharing it across users',async()=>{
    const categoryId=(await a.get('/api/categories').expect(200)).body.data.find((x:any)=>x.name==='Food').id;
    const ruleId=(await a.post('/api/banking/rules').set('Origin',origin).send({merchant:'Market',direction:'debit',categoryId}).expect(201)).body.data.id;
    await b.delete(`/api/banking/rules/${ruleId}`).set('Origin',origin).expect(404);
    bank.entries.set('A-bgn',[...(bank.entries.get('A-bgn')??[]),tx('rule-new','debit','2.00','BGN','Market')]);
    await syncConnection(pool,bank,secrets,userA,connectionId,true);
    const category=await withUserTransaction(pool,userA,async(client)=>(await client.query(`SELECT t.category_id AS id
      FROM bank_transactions bt JOIN transactions t ON t.id=bt.ledger_transaction_id
      WHERE bt.entry_reference='rule-new'`)).rows[0]?.id);
    expect(category).toBe(categoryId);
    await a.delete(`/api/banking/rules/${ruleId}`).set('Origin',origin).expect(204);
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
});
