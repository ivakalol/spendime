import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDashboard, useMe, useSavePreferences, useTransactions } from '../api/queries';
import { Button, Card, ErrorState, Field, FormError, LoadingState, PageHeader } from '../components/ui';
import { CurrencySelect } from '../components/CurrencySelect';
import { SpendingDonut, SpendingTrend } from '../components/SpendingCharts';
import { QuickAdd } from '../features/QuickAdd';
import { AccountDialog } from './AccountsPage';
import { spendingChange } from '../utils/analytics';
import { addCalendarDays, todayInTimezone, toZonedLocalInput } from '../utils/dateTime';
import { formatMoney } from '../utils/money';
import { useLanguage } from '../i18n';
export { TrendChart } from '../components/LegacyTrend';

const periodStorageKey = 'spendime.dashboard.period';
const periods = [['day','Day'],['week','Week'],['month','Month'],['year','Year'],['total','Total']] as const;
type Period = (typeof periods)[number][0];
function savedPeriod(): Period {
  try {
    const value=localStorage.getItem(periodStorageKey);
    if(periods.some(([key])=>key===value)) return value as Period;
    if(value==='this-week') return 'week';
    if(value==='last-month'||value==='last-30-days'||value==='this-month') return 'month';
    if(value==='this-year') return 'year';
  } catch { /* Browser storage may be unavailable. */ }
  return 'month';
}
function addCalendarYears(date:string,years:number):string {
  const [year=0,month=1,day=1]=date.split('-').map(Number);
  const lastDay=new Date(Date.UTC(year+years,month,0)).getUTCDate();
  return `${year+years}-${String(month).padStart(2,'0')}-${String(Math.min(day,lastDay)).padStart(2,'0')}`;
}
export function dashboardWindow(period:Exclude<Period,'total'>,stepsBack:number,today:string) {
  let endExclusive=addCalendarDays(today,1);
  if(period==='year') {
    for(let step=0;step<stepsBack;step++) endExclusive=addCalendarYears(endExclusive,-1);
    return {from:addCalendarYears(endExclusive,-1),to:addCalendarDays(endExclusive,-1)};
  }
  const days=period==='day'?1:period==='week'?7:30;
  endExclusive=addCalendarDays(endExclusive,-days*stepsBack);
  return {from:addCalendarDays(endExclusive,-days),to:addCalendarDays(endExclusive,-1)};
}
function formatDate(date:string,language:'en'|'bg',long=false) {
  const [year=0,month=1,day=1]=date.split('-').map(Number);
  return new Intl.DateTimeFormat(language==='bg'?'bg-BG':'en-US',{month:long?'long':'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(year,month-1,day,12)));
}

export default function DashboardPage() {
  const me = useMe();
  const {language,t}=useLanguage();
  const [period,setPeriod] = useState(savedPeriod);
  const [stepsBack,setStepsBack] = useState(0);
  const periodScroller=useRef<HTMLDivElement>(null);
  const today=todayInTimezone(me.data?.timezone??'UTC');
  const earliest=useTransactions(new URLSearchParams('limit=1&sort=occurredAt&direction=asc'),period==='total');
  const firstTransaction=earliest.data?.data[0];
  const firstDate=firstTransaction ? toZonedLocalInput(firstTransaction.occurredAt,me.data?.timezone??'UTC').slice(0,10) : null;
  const range=period==='total' ? {from:firstDate && firstDate<=today?firstDate:today,to:today} : dashboardWindow(period,stepsBack,today);
  useEffect(()=>{try { localStorage.setItem(periodStorageKey,period); } catch {}},[period]);
  const [adding,setAdding] = useState(false);
  const [account,setAccount] = useState(false);
  const dashboard=useDashboard('custom',undefined,range.from,range.to,Boolean(me.data) && (period!=='total'||earliest.isSuccess));
  useEffect(()=>{
    const scroller=periodScroller.current;
    const selected=scroller?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    if(scroller&&selected) scroller.scrollLeft=selected.offsetLeft-scroller.offsetLeft-(scroller.clientWidth-selected.clientWidth)/2;
  },[period,dashboard.isPending]);
  if(period==='total'&&earliest.isError)return <ErrorState error={earliest.error} retry={()=>earliest.refetch()}/>;
  if(dashboard.isPending)return <LoadingState label="Preparing your overview…"/>;
  if(dashboard.isError)return <ErrorState error={dashboard.error} retry={()=>dashboard.refetch()}/>;
  const data=dashboard.data;
  const currency=me.data?.baseCurrency||'EUR';
  const activeLabel=period==='total'&&(!firstDate||firstDate>today)?t('No transactions yet'):period==='day'?formatDate(range.to,language,true):`${formatDate(range.from,language)} – ${formatDate(range.to,language)}`;
  const otherBalances=data.balanceTotals.filter(row=>row.currency!==currency);
  const cash=data.cashFlow.find(row=>row.currency===currency);
  const previous=data.previousCashFlow.find(row=>row.currency===currency);
  const balance=data.balanceTotals.find(row=>row.currency===currency);
  return <>
    <div className="dashboard-heading"><PageHeader eyebrow="Your money, clearly" title={me.data?.displayName ? `Hello, ${me.data.displayName.split(' ')[0]}` : 'Overview'} description="A clear picture of what you have and where it goes." action={<Button onClick={()=>setAdding(true)}><Plus className="size-4"/>Add transaction</Button>}/></div>
    {!me.data?.onboardingCompletedAt && <GettingStarted hasAccounts={data.accountBalances.length>0} onAccount={()=>setAccount(true)} onTransaction={()=>setAdding(true)}/>}
    <Card className="mb-3 border-brand/15 sm:mb-5"><div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 sm:items-start sm:gap-4"><div className="min-w-0 flex-1 sm:flex-none"><p className="text-sm text-muted">Total account balance · {currency}</p><p className="money-value mt-1 text-3xl font-bold tracking-tight sm:mt-2 sm:text-4xl">{formatMoney(balance?.balance,currency)}</p><p className="mt-1 text-xs text-muted sm:mt-2">Current recorded balances, including any negative balances.</p></div><Link to="/accounts" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand underline sm:text-base">View accounts →</Link></div>{otherBalances.length>0&&<p className="mt-4 border-t border-brand/10 pt-3 text-sm text-muted">Other currencies: {otherBalances.map(row=>`${row.currency} ${formatMoney(row.balance,row.currency)}`).join(' · ')}</p>}</Card>
    <div className="mb-3 rounded-2xl border border-brand/10 bg-surface p-2 shadow-sm sm:mb-5 sm:p-3">
      <div ref={periodScroller} role="group" aria-label={t('Period')} className="flex gap-1 overflow-x-auto rounded-xl bg-brand/[.045] p-1">
        {periods.map(([key,label])=><button key={key} type="button" aria-pressed={period===key} onClick={()=>{setPeriod(key);setStepsBack(0);}} className={`min-h-11 min-w-[3.5rem] flex-1 whitespace-nowrap rounded-lg px-2 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent sm:min-w-[4.8rem] sm:px-3 sm:text-sm ${period===key?'bg-brand text-white shadow-sm':'text-muted hover:bg-brand/[.07] hover:text-ink'}`}>{t(label)}</button>)}
      </div>
      <div className="mt-2 flex min-h-11 items-center justify-center gap-2">
        {period!=='total'&&<Button variant="ghost" className="size-11 shrink-0 px-0" aria-label={t('Previous period')} onClick={()=>setStepsBack(value=>value+1)}><ChevronLeft className="size-5"/></Button>}
        <span aria-live="polite" className="min-w-0 flex-1 text-center text-sm font-semibold text-ink">{activeLabel}</span>
        {period!=='total'&&<Button variant="ghost" className="size-11 shrink-0 px-0" aria-label={t('Next period')} disabled={stepsBack===0} onClick={()=>setStepsBack(value=>Math.max(0,value-1))}><ChevronRight className="size-5"/></Button>}
      </div>
      <p className="px-2 pb-1 text-center text-xs leading-relaxed text-muted">{data.bounds.timezone}{period!=='total'&&` · ${t('Compared with')} ${formatDate(data.comparisonBounds.startLocal,language)} – ${formatDate(addCalendarDays(data.comparisonBounds.endLocalExclusive,-1),language)}`}</p>
    </div>
    <div className="mobile-kpis grid gap-2 sm:gap-4 md:grid-cols-3"><Metric label={`Spending · ${currency}`} value={formatMoney(cash?.actualSpending,currency)} detail={period==='total'?'All recorded spending':spendingChange(cash?.actualSpending??'0',previous?.actualSpending??'0')}/><Metric label={`Income · ${currency}`} value={formatMoney(cash?.actualIncome,currency)} detail={period==='total'?'All recorded income':`Previous period: ${formatMoney(previous?.actualIncome,currency)}`}/><Metric label={`Net cash flow · ${currency}`} value={formatMoney(cash?.ordinaryNetCashFlow,currency)} detail="Income minus spending, after refunds"/></div>
    <p className="my-3 text-xs leading-relaxed text-muted sm:my-4">Transfers and opening balances are excluded. Assets, loans and repayments are tracked separately from everyday income and spending.</p>
    <div className="grid items-start gap-3 sm:gap-5 xl:grid-cols-[1.25fr_1fr]"><SpendingTrend data={data} currency={currency} period={period}/><SpendingDonut rows={data.spendingByCategory} currency={currency}/></div>
    <div className="mt-3 grid gap-3 sm:mt-5 sm:gap-5 lg:grid-cols-2"><Card><div className="flex items-center justify-between"><h2 className="font-bold">Your accounts</h2><Button variant="ghost" onClick={()=>setAccount(true)}>Add account</Button></div>{data.accountBalances.length ? <ul className="mt-1 divide-y divide-brand/10 sm:mt-3">{data.accountBalances.map(row=><li key={row.accountId}><Link to="/accounts" className="flex min-h-14 items-center justify-between gap-3 py-2 sm:min-h-16 sm:py-3"><span><span className="block font-semibold">{row.name}</span><span className="text-xs text-muted">{row.currency}</span></span><strong className="money-value">{formatMoney(row.currentBalance,row.currency)}</strong></Link></li>)}</ul> : <p className="py-6 text-sm text-muted">Add a bank, cash or savings account to start tracking your money.</p>}</Card>
    <Card><div className="flex min-h-11 items-center justify-between gap-3"><h2 className="font-bold">Recent activity</h2><Link className="text-sm font-semibold underline" to="/transactions">View all</Link></div><p className="text-xs text-muted">All currencies · selected period</p>{data.recentTransactions.length ? <ul className="mt-1 divide-y divide-brand/10 sm:mt-3">{data.recentTransactions.map(row=><li key={row.id} className="flex min-h-14 items-center justify-between gap-3 py-2 sm:min-h-16 sm:py-3"><span className="min-w-0"><span className="block truncate font-semibold">{row.title}</span><span className="text-xs capitalize text-muted">{row.kind.replaceAll('_',' ')} · {row.currency}</span></span><strong className="money-value shrink-0 text-sm">{formatMoney(row.amount,row.currency)}</strong></li>)}</ul> : <div className="py-6"><p className="mb-3 text-sm text-muted">No transactions in this period. Record your first expense to see where your money goes.</p><Button variant="secondary" onClick={()=>setAdding(true)}>Add transaction</Button></div>}</Card></div>
    <details className="mt-3 rounded-2xl border border-brand/10 bg-surface p-4 sm:mt-5 sm:p-5"><summary className="cursor-pointer font-semibold">Assets, debts & other money movements · {currency}</summary><div className="mobile-pair-grid mt-4 grid gap-3 text-sm sm:grid-cols-2"><p>Things you own: <strong>{formatMoney(data.assetSummary.find(row=>row.currency===currency)?.currentValue,currency)}</strong> <Link to="/assets" className="underline">View assets</Link></p><p>Money you owe: <strong>{formatMoney(data.liabilitySummary.find(row=>row.currency===currency)?.outstandingBalance,currency)}</strong> <Link to="/liabilities" className="underline">View debts</Link></p><p>Asset purchases: {formatMoney(cash?.assetPurchases,currency)}</p><p>Asset sale proceeds: {formatMoney(cash?.assetSaleProceeds,currency)}</p><p>Loan repayments: {formatMoney(cash?.liabilityPayments,currency)}</p><p>Borrowed: {formatMoney(cash?.liabilityDrawdowns,currency)}</p><p>Cost spread over use days: {formatMoney(data.utilityImpact.find(row=>row.currency===currency)?.utilityAdjustedCost,currency)}</p></div></details>
    {adding&&<QuickAdd open onClose={()=>setAdding(false)}/>}<AccountDialog value={null} open={account} onClose={()=>setAccount(false)}/>
  </>;
}

function Metric({label,value,detail}:{label:string;value:string;detail:string}) {
  return <Card><p className="text-xs text-muted sm:text-sm">{label}</p><p className="money-value mt-1 break-words text-lg font-bold sm:mt-2 sm:text-2xl">{value}</p><p className="mt-1 text-[11px] leading-snug text-muted sm:mt-2 sm:text-xs sm:leading-relaxed">{detail}</p></Card>;
}

function GettingStarted({hasAccounts,onAccount,onTransaction}:{hasAccounts:boolean;onAccount:()=>void;onTransaction:()=>void}) {
  const me=useMe(),save=useSavePreferences();
  const [currency,setCurrency]=useState(me.data?.baseCurrency??'EUR');
  const [saved,setSaved]=useState(false);
  return <Card className="mb-5 border-brand/20 bg-brand/[.035]"><h2 className="text-lg font-bold">Make yourself at home</h2><p className="mt-1 text-sm text-muted">Start with one account and one transaction. You can add the rest whenever you like.</p><ol className="mt-5 grid gap-5 md:grid-cols-3"><li><h3 className="mb-3 font-semibold">1. Choose your main currency</h3><form className="grid gap-2" onSubmit={event=>{event.preventDefault();save.mutate({baseCurrency:currency},{onSuccess:()=>setSaved(true)});}}><Field label="Reporting currency"><CurrencySelect value={currency} onChange={value=>{setCurrency(value);setSaved(false);}}/></Field><Button variant="secondary" disabled={save.isPending}>{saved?'Currency saved':'Save currency'}</Button></form></li><li><h3 className="mb-2 font-semibold">2. Add your first account</h3><p className="mb-3 text-sm text-muted">An account is where your money lives: a bank account, cash wallet or savings.</p><Button variant="secondary" onClick={onAccount}>{hasAccounts?'Add another account':'Create account'}</Button></li><li><h3 className="mb-2 font-semibold">3. Record a transaction</h3><p className="mb-3 text-sm text-muted">Choose a category, such as Food, to understand what you spend on.</p><Button variant="secondary" disabled={!hasAccounts} onClick={onTransaction}>Add transaction</Button></li></ol><FormError error={save.error}/><div className="mt-4 flex flex-wrap items-center justify-between gap-3">{me.data?.bankingEnabled?<Link to="/banking" className="text-sm font-semibold underline">Or connect your bank</Link>:<span className="text-xs text-muted">Your account currencies always stay separate.</span>}<Button variant="ghost" disabled={save.isPending} onClick={()=>save.mutate({completeOnboarding:true})}>Finish setup for now</Button></div></Card>;
}
