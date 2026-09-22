import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EnableBankingProvider } from '../src/server/domains/banking/enableBanking.js';
import { BankingProviderError } from '../src/server/domains/banking/provider.js';
import { BankingSecrets } from '../src/server/domains/banking/secrets.js';
import { geminiAvailable, minimalBankingText, parseGeminiDecision } from '../src/server/domains/banking/gemini.js';
import { loadConfig } from '../src/server/config.js';

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
      if(url.includes('/transactions'))return data({transactions:[{entry_reference:'stable-1',status:'BOOK',credit_debit_indicator:'DBIT',transaction_amount:{amount:'12.30',currency:'EUR'},booking_date:'2026-09-20',creditor:{name:'Shop'},remittance_information:['Card purchase','Shop']}],continuation_key:null});
      throw new Error(`Unexpected URL ${url}`);
    }));
    const provider=new EnableBankingProvider('test-app',pem);
    expect((await provider.institutions('BG'))[0]?.name).toBe('Mock ASPSP');
    expect((await provider.begin({institution:{name:'Mock ASPSP',country:'BG',beta:false,maximumConsentValiditySeconds:7776000},state:'state',redirectUri:'https://example.test/api/banking/callback'})).url).toContain('tilisy-sandbox.enablebanking.com');
    expect((await provider.complete('code')).accounts[0]).toMatchObject({providerAccountId:'account-1',identificationHash:'hash-1'});
    expect(await provider.sessionStatus('session-1')).toBe('active');
    expect((await provider.balance('account-1'))?.amount).toBe('-5.00');
    expect((await provider.transactions('account-1',{initial:true})).transactions[0]).toMatchObject({status:'BOOK',direction:'debit',description:'Card purchase Shop',entryReference:'stable-1'});
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

describe('banking privacy controls',()=>{
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
