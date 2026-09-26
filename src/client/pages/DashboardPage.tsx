import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDashboard, useMe, useSavePreferences } from '../api/queries';
import { Button, Card, ErrorState, Field, FormError, Input, LoadingState, PageHeader, Select } from '../components/ui';
import { CurrencySelect } from '../components/CurrencySelect';
import { SpendingDonut, SpendingTrend } from '../components/SpendingCharts';
import { QuickAdd } from '../features/QuickAdd';
import { AccountDialog } from './AccountsPage';
import { spendingChange } from '../utils/analytics';
import { addCalendarDays, todayInTimezone } from '../utils/dateTime';
import { formatMoney } from '../utils/money';
export { TrendChart } from '../components/LegacyTrend';

export default function DashboardPage() {
  const me = useMe();
  const [timeframe,setTimeframe] = useState('this-month');
  const today=todayInTimezone(me.data?.timezone??'UTC');
  const [from,setFrom] = useState(today.slice(0,7)+'-01');
  const [to,setTo] = useState(today);
  const [range,setRange] = useState({from,to});
  const [selectedCurrency,setSelectedCurrency] = useState('');
  const [adding,setAdding] = useState(false);
  const [account,setAccount] = useState(false);
  const dashboard=useDashboard(timeframe,undefined,timeframe==='custom'?range.from:undefined,timeframe==='custom'?range.to:undefined);
  if(dashboard.isPending)return <LoadingState label="Preparing your overview…"/>;
  if(dashboard.isError)return <ErrorState error={dashboard.error} retry={()=>dashboard.refetch()}/>;
  const data=dashboard.data;
  const currency=selectedCurrency||me.data?.baseCurrency||'EUR';
  const currencies=[...new Set([me.data?.baseCurrency??'EUR',...(selectedCurrency?[selectedCurrency]:[]),...data.assetSummary.map(row=>row.currency),...data.liabilitySummary.map(row=>row.currency),...data.cashFlow.map(row=>row.currency),...data.balanceTotals.map(row=>row.currency),...data.previousCashFlow.map(row=>row.currency)])].sort();
  const cash=data.cashFlow.find(row=>row.currency===currency);
  const previous=data.previousCashFlow.find(row=>row.currency===currency);
  const balance=data.balanceTotals.find(row=>row.currency===currency);
  return <>
    <PageHeader eyebrow="Your money, clearly" title={me.data?.displayName ? `Hello, ${me.data.displayName.split(' ')[0]}` : 'Overview'} description="A clear picture of what you have and where it goes." action={<Button onClick={()=>setAdding(true)}><Plus className="size-4"/>Add transaction</Button>}/>
    {!me.data?.onboardingCompletedAt && <GettingStarted hasAccounts={data.accountBalances.length>0} onAccount={()=>setAccount(true)} onTransaction={()=>setAdding(true)}/>}
    <Card className="mb-5 border-brand/15"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-muted">Total account balance · {currency}</p><p className="money-value mt-2 text-4xl font-bold tracking-tight">{formatMoney(balance?.balance,currency)}</p><p className="mt-2 text-xs text-muted">Current recorded balances, including any negative balances.</p></div><Link to="/accounts" className="inline-flex min-h-11 items-center gap-2 font-semibold text-brand underline">View accounts →</Link></div>{currencies.length>1&&<p className="mt-4 border-t border-brand/10 pt-3 text-sm text-muted">Other currencies: {data.balanceTotals.filter(row=>row.currency!==currency).map(row=>`${row.currency} ${formatMoney(row.balance,row.currency)}`).join(' · ')||'No other account balances'}</p>}</Card>
    <Card className="mb-5"><div className="grid gap-4 sm:grid-cols-2"><Field label="Period"><Select value={timeframe} onChange={event=>setTimeframe(event.target.value)}><option value="this-week">This week so far</option><option value="this-month">This month so far</option><option value="last-month">Last month</option><option value="last-30-days">Last 30 days</option><option value="this-year">This year so far</option><option value="custom">Custom range</option></Select></Field><Field label="View currency" hint="Currencies are shown separately. No exchange rates or conversions are applied."><Select value={currency} onChange={event=>setSelectedCurrency(event.target.value)}>{currencies.map(code=><option key={code}>{code}</option>)}</Select></Field></div>
    {timeframe==='custom'&&<form className="mt-4 grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={event=>{event.preventDefault();setRange({from,to});}}><Field label="From"><Input type="date" value={from} max={to} onChange={event=>setFrom(event.target.value)} required/></Field><Field label="Through"><Input type="date" value={to} min={from} max={addCalendarDays(from,730)} onChange={event=>setTo(event.target.value)} required/></Field><Button>Apply dates</Button></form>}
    <p className="mt-4 text-xs leading-relaxed text-muted">{data.bounds.startLocal.slice(0,10)} – {addCalendarDays(data.bounds.endLocalExclusive.slice(0,10),-1)} · {data.bounds.timezone}. Compared with {data.comparisonBounds.startLocal} – {addCalendarDays(data.comparisonBounds.endLocalExclusive,-1)}, the preceding equal number of days.</p></Card>
    <div className="grid gap-4 md:grid-cols-3"><Metric label={`Spending · ${currency}`} value={formatMoney(cash?.actualSpending,currency)} detail={spendingChange(cash?.actualSpending??'0',previous?.actualSpending??'0')}/><Metric label={`Income · ${currency}`} value={formatMoney(cash?.actualIncome,currency)} detail={`Previous period: ${formatMoney(previous?.actualIncome,currency)}`}/><Metric label={`Net cash flow · ${currency}`} value={formatMoney(cash?.ordinaryNetCashFlow,currency)} detail="Income minus spending, after refunds"/></div>
    <p className="my-4 text-xs leading-relaxed text-muted">Transfers and opening balances are excluded. Assets, loans and repayments are tracked separately from everyday income and spending.</p>
    <div className="grid items-start gap-5 xl:grid-cols-[1.25fr_1fr]"><SpendingTrend data={data} currency={currency}/><SpendingDonut rows={data.spendingByCategory} currency={currency}/></div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2"><Card><div className="flex items-center justify-between"><h2 className="font-bold">Your accounts</h2><Button variant="ghost" onClick={()=>setAccount(true)}>Add account</Button></div>{data.accountBalances.length ? <ul className="mt-3 divide-y divide-brand/10">{data.accountBalances.map(row=><li key={row.accountId}><Link to="/accounts" className="flex min-h-16 items-center justify-between gap-3 py-3"><span><span className="block font-semibold">{row.name}</span><span className="text-xs text-muted">{row.currency}</span></span><strong className="money-value">{formatMoney(row.currentBalance,row.currency)}</strong></Link></li>)}</ul> : <p className="py-6 text-sm text-muted">Add a bank, cash or savings account to start tracking your money.</p>}</Card>
    <Card><div className="flex min-h-11 items-center justify-between gap-3"><h2 className="font-bold">Recent activity</h2><Link className="text-sm font-semibold underline" to="/transactions">View all</Link></div><p className="text-xs text-muted">All currencies · selected period</p>{data.recentTransactions.length ? <ul className="mt-3 divide-y divide-brand/10">{data.recentTransactions.map(row=><li key={row.id} className="flex min-h-16 items-center justify-between gap-3 py-3"><span className="min-w-0"><span className="block truncate font-semibold">{row.title}</span><span className="text-xs capitalize text-muted">{row.kind.replaceAll('_',' ')} · {row.currency}</span></span><strong className="money-value shrink-0 text-sm">{formatMoney(row.amount,row.currency)}</strong></li>)}</ul> : <div className="py-6"><p className="mb-3 text-sm text-muted">No transactions in this period. Record your first expense to see where your money goes.</p><Button variant="secondary" onClick={()=>setAdding(true)}>Add transaction</Button></div>}</Card></div>
    <details className="mt-5 rounded-2xl border border-brand/10 bg-surface p-5"><summary className="cursor-pointer font-semibold">Assets, debts & other money movements · {currency}</summary><div className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><p>Things you own: <strong>{formatMoney(data.assetSummary.find(row=>row.currency===currency)?.currentValue,currency)}</strong> <Link to="/assets" className="underline">View assets</Link></p><p>Money you owe: <strong>{formatMoney(data.liabilitySummary.find(row=>row.currency===currency)?.outstandingBalance,currency)}</strong> <Link to="/liabilities" className="underline">View debts</Link></p><p>Asset purchases: {formatMoney(cash?.assetPurchases,currency)}</p><p>Asset sale proceeds: {formatMoney(cash?.assetSaleProceeds,currency)}</p><p>Loan repayments: {formatMoney(cash?.liabilityPayments,currency)}</p><p>Borrowed: {formatMoney(cash?.liabilityDrawdowns,currency)}</p><p>Cost spread over use days: {formatMoney(data.utilityImpact.find(row=>row.currency===currency)?.utilityAdjustedCost,currency)}</p></div></details>
    {adding&&<QuickAdd open onClose={()=>setAdding(false)}/>}<AccountDialog value={null} open={account} onClose={()=>setAccount(false)}/>
  </>;
}

function Metric({label,value,detail}:{label:string;value:string;detail:string}) {
  return <Card><p className="text-sm text-muted">{label}</p><p className="money-value mt-2 break-words text-2xl font-bold">{value}</p><p className="mt-2 text-xs leading-relaxed text-muted">{detail}</p></Card>;
}

function GettingStarted({hasAccounts,onAccount,onTransaction}:{hasAccounts:boolean;onAccount:()=>void;onTransaction:()=>void}) {
  const me=useMe(),save=useSavePreferences();
  const [currency,setCurrency]=useState(me.data?.baseCurrency??'EUR');
  const [saved,setSaved]=useState(false);
  return <Card className="mb-5 border-brand/20 bg-brand/[.035]"><h2 className="text-lg font-bold">Make yourself at home</h2><p className="mt-1 text-sm text-muted">Start with one account and one transaction. You can add the rest whenever you like.</p><ol className="mt-5 grid gap-5 md:grid-cols-3"><li><h3 className="mb-3 font-semibold">1. Choose your main currency</h3><form className="grid gap-2" onSubmit={event=>{event.preventDefault();save.mutate({baseCurrency:currency},{onSuccess:()=>setSaved(true)});}}><Field label="Reporting currency"><CurrencySelect value={currency} onChange={value=>{setCurrency(value);setSaved(false);}}/></Field><Button variant="secondary" disabled={save.isPending}>{saved?'Currency saved':'Save currency'}</Button></form></li><li><h3 className="mb-2 font-semibold">2. Add your first account</h3><p className="mb-3 text-sm text-muted">An account is where your money lives: a bank account, cash wallet or savings.</p><Button variant="secondary" onClick={onAccount}>{hasAccounts?'Add another account':'Create account'}</Button></li><li><h3 className="mb-2 font-semibold">3. Record a transaction</h3><p className="mb-3 text-sm text-muted">Choose a category, such as Food, to understand what you spend on.</p><Button variant="secondary" disabled={!hasAccounts} onClick={onTransaction}>Add transaction</Button></li></ol><FormError error={save.error}/><div className="mt-4 flex flex-wrap items-center justify-between gap-3">{me.data?.bankingEnabled?<Link to="/banking" className="text-sm font-semibold underline">Or connect your bank</Link>:<span className="text-xs text-muted">Your account currencies always stay separate.</span>}<Button variant="ghost" disabled={save.isPending} onClick={()=>save.mutate({completeOnboarding:true})}>Finish setup for now</Button></div></Card>;
}
