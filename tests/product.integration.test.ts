import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { createPool, assertSafeRuntimeRole } from '../src/server/db/pool.js';

describe('product preferences and currency-separated analytics',()=>{
  const config=loadConfig({...process.env,NODE_ENV:'test',COOKIE_SECURE:'never',AUTH_RATE_LIMIT_MAX:'100'});
  const pool=createPool(config.databaseUrl,3);
  const app=createApp(pool,config);
  const a=request.agent(app),b=request.agent(app);
  const ids:string[]=[];
  let eur:string,usd:string,savings:string,category:string;
  beforeAll(async()=>{
    await assertSafeRuntimeRole(pool);
    for(const [index,agent] of [a,b].entries()) ids.push((await agent.post('/api/auth/register').send({email:`product-${crypto.randomUUID()}@example.test`,displayName:`Product ${index}`,password:'Correct-Horse-47!'}).expect(201)).body.data.user.id);
    eur=(await a.post('/api/accounts').send({name:'EUR checking',kind:'checking',currency:'EUR',openingBalance:'1000'}).expect(201)).body.data.id;
    usd=(await a.post('/api/accounts').send({name:'USD wallet',kind:'cash',currency:'USD',openingBalance:'100'}).expect(201)).body.data.id;
    savings=(await a.post('/api/accounts').send({name:'EUR savings',kind:'savings',currency:'EUR'}).expect(201)).body.data.id;
    category=(await a.post('/api/categories').send({name:'Groceries',kind:'expense'}).expect(201)).body.data.id;
  });
  afterAll(async()=>{await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids]);await pool.end();});
  it('persists preferences across sessions without changing account currencies or other users',async()=>{
    await a.patch('/api/auth/preferences').send({baseCurrency:'USD',timezone:'Europe/Sofia',completeOnboarding:true}).expect(200);
    const me=(await a.get('/api/auth/me').expect(200)).body.data.user;
    expect(me).toMatchObject({baseCurrency:'USD',timezone:'Europe/Sofia'});expect(me.onboardingCompletedAt).toBeTruthy();
    expect((await b.get('/api/auth/me')).body.data.user.baseCurrency).toBe('EUR');
    expect((await a.get(`/api/accounts/${eur}`)).body.data.currency).toBe('EUR');
    await a.patch('/api/auth/preferences').send({userId:ids[1],baseCurrency:'GBP'}).expect(400);
    await a.patch('/api/auth/preferences').send({baseCurrency:'ZZZ'}).expect(400);
    await a.patch('/api/auth/preferences').send({timezone:'Somewhere/Invalid'}).expect(400);
    await request(app).patch('/api/auth/preferences').send({baseCurrency:'GBP'}).expect(401);
    await a.patch('/api/auth/preferences').set('Origin','https://evil.test').send({baseCurrency:'GBP'}).expect(403);
  });
  it('excludes transfers, opening balances, voids and adjustments; subtracts refunds by category',async()=>{
    const add=(body:object)=>a.post('/api/transactions').send({occurredAt:'2026-03-29T10:00:00Z',currency:'EUR',...body}).expect(201);
    await add({kind:'expense',sourceAccountId:eur,amount:'80',categoryId:category});
    await add({kind:'refund',destinationAccountId:eur,amount:'20',categoryId:category});
    await add({kind:'expense',sourceAccountId:eur,amount:'10'});
    await add({kind:'income',destinationAccountId:eur,amount:'200'});
    await add({kind:'transfer',sourceAccountId:eur,destinationAccountId:savings,amount:'500'});
    await add({kind:'adjustment',destinationAccountId:eur,amount:'7'});
    await add({kind:'expense',sourceAccountId:usd,amount:'30',currency:'USD'});
    const voided=await add({kind:'expense',sourceAccountId:eur,amount:'999'});
    await a.delete(`/api/transactions/${voided.body.data.id}`).expect(204);
    await add({kind:'expense',sourceAccountId:eur,amount:'35',occurredAt:'2026-03-28T10:00:00Z'});
    const data=(await a.get('/api/dashboard?timeframe=custom&from=2026-03-29&to=2026-03-29').expect(200)).body.data;
    expect(data.cashFlow.find((r:any)=>r.currency==='EUR')).toMatchObject({actualSpending:'70.0000',actualIncome:'200.0000',ordinaryNetCashFlow:'130.0000'});
    expect(data.cashFlow.find((r:any)=>r.currency==='USD').actualSpending).toBe('30.0000');
    expect(data.spendingByCategory.find((r:any)=>r.categoryId===category).actualSpending).toBe('60.0000');
    expect(data.spendingByCategory.find((r:any)=>r.currency==='EUR'&&r.categoryId===null).actualSpending).toBe('10.0000');
    expect(data.previousCashFlow.find((r:any)=>r.currency==='EUR').actualSpending).toBe('35.0000');
    expect(data.balanceTotals.find((r:any)=>r.currency==='EUR').balance).toBe('1102.0000');
    expect(data.balanceTotals.find((r:any)=>r.currency==='USD').balance).toBe('70.0000');
    expect(data.bounds.startUtc).toBe('2026-03-28T22:00:00.000Z');
    expect(data.bounds.endUtcExclusive).toBe('2026-03-29T21:00:00.000Z');
    expect(data.comparisonBounds).toEqual({startLocal:'2026-03-28',endLocalExclusive:'2026-03-29'});
    const isolated=(await b.get('/api/dashboard?timeframe=custom&from=2026-03-29&to=2026-03-29')).body.data;
    expect(isolated.cashFlow).toEqual([]);expect(isolated.balanceTotals).toEqual([]);expect(isolated.recentTransactions).toEqual([]);
    await a.patch(`/api/accounts/${eur}`).send({currency:'USD'}).expect(409);
  });
  it('validates custom ranges and uses inclusive calendar periods with equivalent comparisons',async()=>{
    for(const query of ['timeframe=custom','timeframe=custom&from=2026-02-30&to=2026-03-01','timeframe=custom&from=2026-03-02&to=2026-03-01','timeframe=custom&from=2020-01-01&to=2026-01-01']) await a.get(`/api/dashboard?${query}`).expect(400);
    for(const [frame,start,end] of [['this-week','2026-03-09','2026-03-16'],['this-month','2026-03-01','2026-03-16'],['last-month','2026-02-01','2026-03-01'],['last-30-days','2026-02-14','2026-03-16'],['this-year','2026-01-01','2026-03-16']]){
      const data=(await a.get(`/api/dashboard?timeframe=${frame}&anchor=2026-03-15`).expect(200)).body.data;
      expect(data.bounds.startLocal).toBe(start);expect(data.bounds.endLocalExclusive).toBe(end);
      expect(Date.parse(end!)-Date.parse(start!)).toBe(Date.parse(data.comparisonBounds.endLocalExclusive)-Date.parse(data.comparisonBounds.startLocal));
    }
  });
  it('reports missing banking setup honestly while keeping owner authorization',async()=>{
    const unconfigured=createApp(pool,{...config,bankingOwnerUserId:ids[0]!});
    const login=await request(unconfigured).post('/api/auth/login').send({email:(await a.get('/api/auth/me')).body.data.user.email,password:'Correct-Horse-47!'}).expect(200);
    const cookie=login.headers['set-cookie']!;
    const me=(await request(unconfigured).get('/api/auth/me').set('Cookie',cookie)).body.data.user;
    expect(me).toMatchObject({bankingAccess:true,bankingEnabled:false,bankingStatus:'unconfigured'});
    await request(unconfigured).get('/api/banking/connections').set('Cookie',cookie).expect(503);
  });
});
