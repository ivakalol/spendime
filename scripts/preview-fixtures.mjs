/** Local-only screenshot/QA fixtures. No database, credentials or provider access.
 * Run: node scripts/preview-fixtures.mjs. All writes fail closed.
 * Not included in the production image. Every name and amount is fictional.
 */
import { createServer } from 'vite';
const stamp = '2026-10-01T12:00:00.000Z';
const user = { id: 'demo-user', email: 'demo@example.test', displayName: 'Ivo Demo', baseCurrency: 'EUR', timezone: 'UTC', emailVerifiedAt: null, createdAt: stamp, bankingAccess: false, bankingEnabled: false, onboardingCompletedAt: stamp };
const accounts = [
  { id: 'everyday', name: 'Everyday account', kind: 'checking', openingBalance: '1945.00', currentBalance: '3460.50', color: '#315f61' },
  { id: 'savings', name: 'Savings', kind: 'savings', openingBalance: '4600.00', currentBalance: '5000.00', color: '#c27647' },
].map(value => ({ ...value, currency: 'EUR', institution: null, icon: null, isArchived: false, createdAt: stamp, updatedAt: stamp }));
const categories = ['Food', 'Home', 'Lifestyle', 'Transport', 'Salary'].map((name, i) => ({ id: `category-${i}`, name, kind: i === 4 ? 'income' : 'expense', color: ['#205b50','#c27647','#497ea0','#a9b6a1','#205b50'][i], icon: null, isArchived: false, isSystem: true, createdAt: stamp, updatedAt: stamp }));
const transactions = [
  ['Weekly groceries', 'expense', '64.80', 'category-0', '19'],
  ['Coffee with a friend', 'expense', '8.50', 'category-2', '19'],
  ['Train tickets', 'expense', '42.00', 'category-3', '18'],
  ['To savings', 'transfer', '400.00', null, '17'],
  ['Books and hobbies', 'expense', '248.40', 'category-2', '15'],
  ['Groceries and pantry', 'expense', '513.23', 'category-0', '10'],
  ['Transport pass', 'expense', '86.45', 'category-3', '08'],
  ['Home expenses', 'expense', '321.12', 'category-1', '02'],
  ['Salary', 'income', '3200.00', 'category-4', '01'],
].map(([description, kind, amount, categoryId, day], index) => ({ id: `transaction-${index}`, kind, method: 'standard', sourceAccountId: kind === 'income' ? null : 'everyday', destinationAccountId: kind === 'income' ? 'everyday' : kind === 'transfer' ? 'savings' : null, categoryId, assetId: null, liabilityId: null, recurringRuleId: null, amount, currency: 'EUR', occurredAt: `2026-10-${day}T12:00:00Z`, description, merchant: null, amortizationStart: null, amortizationEnd: null, dailyImpact: null, voidedAt: null, voidReason: null, createdAt: stamp, updatedAt: stamp }));
const assets = [{ id:'demo-asset', name:'Long-term investment', classification:'appreciating', currency:'EUR', acquisitionDate:'2026-01-01', cumulativePrincipal:'6000.00', currentValue:'6800.00', absoluteReturn:'800.00', percentageReturn:'13.3333', depreciation:'none', usefulLifeDays:null, residualValue:null, notes:null, isArchived:false, createdAt:stamp,updatedAt:stamp }];
const liabilities = [{id:'demo-debt',name:'Personal loan',lender:'Example lender',currency:'EUR',originalPrincipal:'4000.00',outstandingBalance:'2400.00',annualInterestRate:'0',openedOn:'2026-01-01',dueOn:'2027-01-01',status:'active',notes:null,createdAt:stamp,updatedAt:stamp}];
const recurring = [{id:'demo-rule',name:'Monthly internet',kind:'expense',sourceAccountId:'everyday',destinationAccountId:null,categoryId:'category-1',assetId:null,liabilityId:null,amount:'29.00',currency:'EUR',intervalCount:1,intervalUnit:'month',startsOn:'2026-10-05',nextDueOn:'2026-11-05',endsOn:null,description:null,isActive:true,lastGeneratedAt:null,createdAt:stamp,updatedAt:stamp}];
const cents = value => Math.round(Number(value) * 100);
const decimal = value => (value / 100).toFixed(2);
const sum = (rows, kind) => rows.filter(tx=>tx.kind===kind).reduce((total,tx)=>total+cents(tx.amount),0);
// Fail before serving if a fixture change makes the ledger or balances disagree.
for(const account of accounts) {
 const delta=transactions.reduce((total,tx)=>total+(tx.destinationAccountId===account.id?cents(tx.amount):0)-(tx.sourceAccountId===account.id?cents(tx.amount):0),0);
 if(cents(account.openingBalance)+delta!==cents(account.currentBalance))throw new Error('Inconsistent fictional account balance');
}
if(sum(transactions,'expense')!==128450||sum(transactions,'income')!==320000)throw new Error('Inconsistent fictional cash flow');
const fixtures = (req, res, next) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (!url.pathname.startsWith('/api/')) return next();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.statusCode = 405; res.end(JSON.stringify({ error: { code: 'fixture_read_only', message: 'This is a read-only sample preview.' } })); return; }
  // Also allow signed-out public-site QA without contacting another API server.
  if(url.pathname==='/api/auth/me' && String(req.headers.referer).includes('visitor=1')) {res.statusCode=401;res.end(JSON.stringify({error:{code:'unauthenticated'}}));return;}
  let data = [];
  if (url.pathname === '/api/auth/me') data = { user };
  if (url.pathname === '/api/accounts') data = accounts;
  if (url.pathname === '/api/categories') data = categories;
  if (url.pathname === '/api/assets') data = assets;
  if (url.pathname === '/api/assets/demo-asset/contributions') data = [{ id:'initial-principal',assetId:'demo-asset',amount:'6000.00',currency:'EUR',contributedAt:'2026-01-01T12:00:00Z',transactionId:null,note:'Fictional initial principal',voidedAt:null,createdAt:stamp }];
  if (url.pathname === '/api/assets/demo-asset/valuations') data = [{id:'current-value',assetId:'demo-asset',value:'6800.00',valuedAt:'2026-10-19T12:00:00Z',note:null,createdAt:stamp},{id:'initial-value',assetId:'demo-asset',value:'6000.00',valuedAt:'2026-01-01T12:00:00Z',note:null,createdAt:stamp}];
  if (url.pathname === '/api/liabilities') data = liabilities;
  if (url.pathname === '/api/recurring-rules') data = recurring;
  if (url.pathname === '/api/transactions') {
    const rows=transactions.filter(tx=>(!url.searchParams.get('kind')||tx.kind===url.searchParams.get('kind'))&&(!url.searchParams.get('accountId')||[tx.sourceAccountId,tx.destinationAccountId].includes(url.searchParams.get('accountId')))&&(!url.searchParams.get('categoryId')||tx.categoryId===url.searchParams.get('categoryId')));
    res.end(JSON.stringify({ data: rows, meta: { limit: 25, offset: 0, total: rows.length } }));return;
  }
  if (url.pathname === '/api/dashboard') {
    const from = url.searchParams.get('from') ?? '2026-09-20';
    const to = url.searchParams.get('to') ?? '2026-10-19';
    const end = new Date(`${to}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 1);
    const rows=transactions.filter(tx=>tx.occurredAt.slice(0,10)>=from && tx.occurredAt.slice(0,10)<=to);
    const spending=sum(rows,'expense'),income=sum(rows,'income');
    const cash = { currency:'EUR',actualSpending:decimal(spending),actualIncome:decimal(income),ordinaryNetCashFlow:decimal(income-spending),assetPurchases:'0',assetSaleProceeds:'0',liabilityPayments:'0',liabilityDrawdowns:'0' };
    const dates=[...new Set(rows.map(tx=>tx.occurredAt.slice(0,10)))].sort();
    const points=dates.map(date=>({currency:'EUR',bucketStartLocal:date,actualSpending:decimal(sum(rows.filter(tx=>tx.occurredAt.startsWith(date)),'expense')),actualIncome:decimal(sum(rows.filter(tx=>tx.occurredAt.startsWith(date)),'income')),assetPurchases:'0'}));
    data = {timeframe:'custom',bounds:{startLocal:from,endLocalExclusive:end.toISOString().slice(0,10),timezone:'UTC',anchorDate:to,startUtc:`${from}T00:00:00Z`,endUtcExclusive:end.toISOString()},comparisonBounds:{startLocal:'2026-08-21',endLocalExclusive:'2026-09-20'},balanceTotals:[{currency:'EUR',balance:decimal(accounts.reduce((total,a)=>total+cents(a.currentBalance),0))}],cashFlow:[cash],previousCashFlow:[{currency:'EUR',actualSpending:'0',actualIncome:'0'}],utilityImpact:[{currency:'EUR',utilityAdjustedCost:'0'}],assetSummary:[{currency:'EUR',cumulativePrincipal:'6000.00',currentValue:'6800.00',absoluteGainLoss:'800.00',simpleReturnPercentage:'13.3333'}],liabilitySummary:[{currency:'EUR',originalPrincipal:'4000.00',outstandingBalance:'2400.00'}],spendingByCategory:categories.slice(0,4).map(category=>({currency:'EUR',categoryId:category.id,categoryName:category.name,actualSpending:decimal(sum(rows.filter(tx=>tx.categoryId===category.id),'expense'))})),accountBalances:accounts.map(account=>({accountId:account.id,...account})),recentTransactions:rows.slice(0,5).map(tx=>({...tx,title:tx.description})),trends:{actualCashFlow:points,utilityImpact:[],assetUnrealizedGainChange:[]}};
  }
  res.end(JSON.stringify({ data }));
};
const server = await createServer({
  server:{host:'127.0.0.1',port:5175,strictPort:true},clearScreen:false,
  plugins:[{name:'read-only-fictional-fixtures',configureServer(server){server.middlewares.use(fixtures);}}],
});
await server.listen();
console.log('Read-only fictional Ivo fixtures: http://127.0.0.1:5175/app');
