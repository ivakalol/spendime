import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EnableBankingProvider, retryAfterSeconds } from '../src/server/domains/banking/enableBanking.js';
import { effectiveSyncIntervalMinutes } from '../src/server/domains/banking/sync.js';
import { BankingProviderError } from '../src/server/domains/banking/provider.js';
import { BankingSecrets } from '../src/server/domains/banking/secrets.js';
import { geminiAvailable, minimalBankingText, parseGeminiDecision } from '../src/server/domains/banking/gemini.js';
import { bankingCredentialConfig, bankingRuntimeEnabled, hasBankingAccess, loadConfig } from '../src/server/config.js';

const { privateKey } = generateKeyPairSync('rsa',{modulusLength:2048});
const pem = privateKey.export({type:'pkcs8',format:'pem'}).toString();
const data = (body:unknown,status=200) => new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
afterEach(()=>vi.unstubAllGlobals());

describe('Enable Banking sandbox adapter',()=>{
  it('rejects a production application before any bank call',async()=>{
    const fetchMock=vi.fn().mockResolvedValue(data({environment:'PRODUCTION',active:true}));
    vi.stubGlobal('fetch',fetchMock);
    await expect(new EnableBankingProvider('test-app',pem).institutions('BG')).rejects.toMatchObject({code:'sandbox_application_required'});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/application$/);
  });

  it('requests account data scope and parses session, balances, and transactions',async()=>{
    const calls:string[]=[];
    vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
      calls.push(`${init?.method??'GET'} ${new URL(url).pathname}`);
      if(url.endsWith('/application'))return data({environment:'SANDBOX',active:true});
      if(url.includes('/aspsps'))return data({aspsps:[{name:'Mock ASPSP',country:'BG',beta:false,maximum_consent_validity:7776000}]});
      if(url.endsWith('/auth')){
        const body=JSON.parse(String(init?.body));
        expect(body.access).toMatchObject({balances:true,transactions:true});
        expect(body.state).toBe('state');
        return data({url:'https://tilisy-sandbox.enablebanking.com/ais/start?sessionid=example'});
      }
      if(url.endsWith('/sessions')&&init?.method==='POST')return data({session_id:'session-1',access:{valid_until:'2027-01-01T00:00:00Z'},accounts:[{uid:'account-1',identification_hash:'hash-1',name:'Sample',currency:'EUR'}]});
      if(url.endsWith('/sessions/session-1'))return data({status:'AUTHORIZED'});
      if(url.endsWith('/balances'))return data({balances:[{balance_type:'CLAV',balance_amount:{amount:'-5.00',currency:'EUR'}}]});
      if(url.includes('/transactions'))return data({transactions:[
        {entry_reference:'stable-1',status:'BOOK',credit_debit_indicator:'DBIT',transaction_amount:{amount:'12.30',currency:'EUR'},booking_date:'2026-09-20',value_date:'2026-09-19',creditor:{name:'Shop'},remittance_information:['Card purchase','Shop']},
        {entry_reference:'stable-2',status:'BOOK',credit_debit_indicator:'CRDT',transaction_amount:{amount:'9.00',currency:'EUR'},booking_date:'2026-09-21',value_date:'2026-09-22',debtor:{name:'Employer'}},
        {entry_reference:'stable-3',status:'PDNG',credit_debit_indicator:'DBIT',transaction_amount:{amount:'1.00',currency:'EUR'},transaction_date:'2026-09-23',creditor:{name:'Shop'}},
      ],continuation_key:null});
      throw new Error(`Unexpected URL ${url}`);
    }));
    const provider=new EnableBankingProvider('test-app',pem);
    expect((await provider.institutions('BG'))[0]?.name).toBe('Mock ASPSP');
    expect((await provider.begin({institution:{name:'Mock ASPSP',country:'BG',beta:false,maximumConsentValiditySeconds:7776000},state:'state',redirectUri:'https://example.test/api/banking/callback'})).url).toContain('tilisy-sandbox.enablebanking.com');
    expect((await provider.complete('code')).accounts[0]).toMatchObject({providerAccountId:'account-1',identificationHash:'hash-1'});
    expect(await provider.sessionStatus('session-1')).toBe('active');
    expect((await provider.balance('account-1'))?.amount).toBe('-5.00');
    const transactions=(await provider.transactions('account-1',{initial:true})).transactions;
    expect(transactions[0]).toMatchObject({status:'BOOK',direction:'debit',description:'Card purchase Shop',entryReference:'stable-1',occurredOn:'2026-09-20'});
    expect(transactions[1]).toMatchObject({status:'BOOK',direction:'credit',entryReference:'stable-2',occurredOn:'2026-09-21'});
    expect(transactions[2]).toMatchObject({status:'PDNG',direction:'debit',occurredOn:'2026-09-23'});
    expect(calls.filter(x=>x.endsWith('/application'))).toHaveLength(1);
  });

  it('surfaces provider rate limits without disclosing response payloads',async()=>{
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.endsWith('/application')?data({environment:'SANDBOX',active:true}):data({error:'RATE_LIMIT_EXCEEDED',secret:'do-not-log'},429)));
    await expect(new EnableBankingProvider('test-app',pem).institutions('BG')).rejects.toBeInstanceOf(BankingProviderError);
  });

  it('rejects authorization redirects outside exact Enable Banking origins',async()=>{
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
      if(url.endsWith('/application'))return data({environment:'SANDBOX',active:true});
      if(url.endsWith('/auth'))return data({url:'https://tilisy-sandbox.enablebanking.com.attacker.test/ais/start'});
      throw new Error(`Unexpected URL ${url}`);
    }));
    const provider=new EnableBankingProvider('test-app',pem);
    await expect(provider.begin({institution:{name:'Mock ASPSP',country:'BG',beta:false,maximumConsentValiditySeconds:7776000},state:'state',redirectUri:'https://example.test/api/banking/callback'}))
      .rejects.toMatchObject({code:'invalid_provider_redirect'});
  });
});

describe('Enable Banking production application guard',()=>{
  const callback='https://spendime.ivaylo.tech/api/banking/callback';
  it('checks active production AIS application and exact registered redirect before bank discovery',async()=>{
    const fetchMock=vi.fn(async(url:string)=>url.endsWith('/application')
      ? data({kid:'production-app',environment:'PRODUCTION',active:true,services:['AIS'],redirect_urls:[callback]})
      : data({aspsps:[{name:'Example Bank',country:'BG',maximum_consent_validity:86400}]}));
    vi.stubGlobal('fetch',fetchMock);
    const provider=new EnableBankingProvider('production-app',pem,'production',callback);
    expect(provider.environment).toBe('production');
    expect(await provider.institutions('BG')).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('submits AIS scope and the public callback to production authorization',async()=>{
    const fetchMock=vi.fn(async(url:string,init?:RequestInit)=>{
      if(url.endsWith('/application')) return data({kid:'production-app',environment:'PRODUCTION',active:true,
        services:['AIS'],redirect_urls:[callback]});
      if(url.endsWith('/auth')) {
        const body=JSON.parse(String(init?.body));
        expect(init?.method).toBe('POST');
        expect(body).toMatchObject({aspsp:{name:'Example Bank',country:'BG'},psu_type:'personal',
          state:'synthetic-state',redirect_url:callback,access:{balances:true,transactions:true}});
        expect(Date.parse(body.access.valid_until)).toBeGreaterThan(Date.now());
        return data({url:'https://auth.enablebanking.com/ais/start?sessionid=synthetic'});
      }
      throw new Error('Unexpected mock request');
    });
    vi.stubGlobal('fetch',fetchMock);
    const provider=new EnableBankingProvider('production-app',pem,'production',callback);
    const institution={name:'Example Bank',country:'BG',beta:false,maximumConsentValiditySeconds:86400};
    expect((await provider.begin({institution,state:'synthetic-state',redirectUri:callback})).url)
      .toContain('auth.enablebanking.com');
    await expect(provider.begin({institution,state:'synthetic-state',redirectUri:'https://other.test/api/banking/callback'}))
      .rejects.toMatchObject({code:'invalid_production_redirect'});
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each([
    {kid:'sandbox-app',environment:'SANDBOX',active:true,services:['AIS'],redirect_urls:[callback]},
    {kid:'production-app',environment:'PRODUCTION',active:false,services:['AIS'],redirect_urls:[callback]},
    {kid:'production-app',environment:'PRODUCTION',active:true,services:['PIS'],redirect_urls:[callback]},
    {kid:'production-app',environment:'PRODUCTION',active:true,services:['AIS'],redirect_urls:['https://other.test/api/banking/callback']},
  ])('rejects an ineligible application before any bank call',async application=>{
    const fetchMock=vi.fn().mockResolvedValue(data(application));
    vi.stubGlobal('fetch',fetchMock);
    await expect(new EnableBankingProvider('production-app',pem,'production',callback).institutions('BG'))
      .rejects.toMatchObject({code:'production_application_required'});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('keeps production secrets separate and the worker disabled by default',()=>{
    const config=loadConfig({DATABASE_URL:'postgres://example.invalid/test',NODE_ENV:'production',
      ENABLE_BANKING_APP_ID:'sandbox-app',ENABLE_BANKING_PRIVATE_KEY_B64:'sandbox-key',
      BANKING_ENCRYPTION_KEY_B64:'sandbox-encryption',BANKING_REDIRECT_URI:'http://localhost:3000/api/banking/callback',
      ENABLE_BANKING_PRODUCTION_APP_ID:'production-app',BANKING_PRODUCTION_ENCRYPTION_KEY_B64:'production-encryption',
      BANKING_PRODUCTION_REDIRECT_URI:callback});
    expect(config.bankingProductionEnabled).toBe(false);
    expect(config.bankingProductionWorkerEnabled).toBe(false);
    expect(bankingCredentialConfig(config)).toMatchObject({appId:'production-app',encryptionKeyB64:'production-encryption',
      redirectUri:callback,environment:'production'});
    const sandbox=bankingCredentialConfig({...config,nodeEnv:'development'});
    expect(sandbox).toMatchObject({appId:'sandbox-app',encryptionKeyB64:'sandbox-encryption',environment:'sandbox'});
  });
});

describe('banking privacy controls',()=>{
  it('fails closed for missing or invalid owner UUID and production activation',()=>{
    const base={DATABASE_URL:'postgres://example.invalid/test',NODE_ENV:'production'};
    const owner='7E1A4E9A-6D82-4AE7-997F-5DC1B237C1A3';
    const missing=loadConfig(base);
    expect(missing.bankingOwnerUserId).toBeUndefined();
    expect(missing.bankingProductionEnabled).toBe(false);
    expect(hasBankingAccess(missing,owner)).toBe(false);
    expect(bankingRuntimeEnabled(missing)).toBe(false);
    expect(loadConfig({...base,BANKING_OWNER_USER_ID:'invalid'}).bankingOwnerUserId).toBeUndefined();
    const configured=loadConfig({...base,BANKING_OWNER_USER_ID:owner});
    expect(hasBankingAccess(configured,owner.toLowerCase())).toBe(true);
    expect(hasBankingAccess(configured,'debdce9c-a91a-4856-8e70-7c937166b5bc')).toBe(false);
    expect(bankingRuntimeEnabled(configured)).toBe(false);
    expect(bankingRuntimeEnabled(loadConfig({...base,BANKING_PRODUCTION_ENABLED:'1'}))).toBe(true);
  });
  it('uses the short interval only for local Enable Banking Mock ASPSP',()=>{
    const sandbox={id:'enable_banking',environment:'sandbox' as const};
    expect(effectiveSyncIntervalMinutes(sandbox,{environment:'sandbox',institutionName:'Mock ASPSP'},5)).toBe(5);
    expect(effectiveSyncIntervalMinutes(sandbox,{environment:'sandbox',institutionName:'Other Bank'},5)).toBe(360);
    expect(effectiveSyncIntervalMinutes(sandbox,{environment:'production',institutionName:'Mock ASPSP'},5)).toBe(360);
    expect(effectiveSyncIntervalMinutes({id:'enable_banking',environment:'production'},{environment:'sandbox',institutionName:'Mock ASPSP'},5)).toBe(360);
    expect(effectiveSyncIntervalMinutes(sandbox,{environment:'sandbox',institutionName:'Mock ASPSP'},1)).toBe(360);
    expect(loadConfig({DATABASE_URL:'postgres://example.invalid/test',NODE_ENV:'production',BANKING_SANDBOX_SYNC_INTERVAL_MINUTES:'5'}).sandboxSyncIntervalMinutes).toBe(360);
    expect(()=>loadConfig({DATABASE_URL:'postgres://example.invalid/test',BANKING_SANDBOX_SYNC_INTERVAL_MINUTES:'1'})).toThrow();
  });
  it('parses both Retry-After forms without exposing provider payloads',()=>{
    expect(retryAfterSeconds('90')).toBe(90);
    expect(retryAfterSeconds('Wed, 23 Sep 2026 15:02:00 GMT',Date.parse('2026-09-23T15:00:00Z'))).toBe(120);
    expect(retryAfterSeconds('invalid')).toBeUndefined();
  });
  it('encrypts session identifiers with authenticated encryption',()=>{
    const key=randomBytes(32).toString('base64');
    const vault=new BankingSecrets(key);
    const first=vault.encrypt('session-secret'); const second=vault.encrypt('session-secret');
    expect(first).not.toContain('session-secret'); expect(first).not.toBe(second);
    expect(vault.decrypt(first)).toBe('session-secret');
    expect(()=>new BankingSecrets(randomBytes(32).toString('base64')).decrypt(first)).toThrow();
  });
  it('keeps Gemini off until all deployment gates are set and redacts identifiers',()=>{
    const base={DATABASE_URL:'postgres://example.invalid/test',GEMINI_ENABLED:'1',GEMINI_API_KEY:'key',GEMINI_MODEL:'gemini-2.5-flash-lite'};
    expect(geminiAvailable(loadConfig(base))).toBe(false);
    expect(geminiAvailable(loadConfig({...base,GEMINI_PAID_PROJECT:'1',GEMINI_PRIVACY_APPROVED:'1'}))).toBe(true);
    expect(minimalBankingText('Paid BG80BNBG96611020345678 customer@example.com ref 123456789')).toBe('Paid [account] [email] ref [number]');
  });
  it('accepts only certain classifications from existing category IDs',()=>{
    const id='00000000-0000-4000-8000-000000000001';
    const other='00000000-0000-4000-8000-000000000002';
    const decision=(categoryId:string|null,uncertain:boolean)=>JSON.stringify({categoryId,normalizedMerchant:'Shop',uncertain,explanation:'Merchant match'});
    expect(parseGeminiDecision(decision(id,false),[id])).toBe(id);
    expect(parseGeminiDecision(decision(other,false),[id])).toBeNull();
    expect(parseGeminiDecision(decision(id,true),[id])).toBeNull();
    expect(()=>parseGeminiDecision('{"categoryId":"bad"}',[id])).toThrow();
  });
});
