import { ArrowDownRight, ArrowUpRight, BarChart3, Landmark, Scale, Sparkles, WalletCards } from 'lucide-react';
import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useDashboard, useMe } from '../api/queries';
import { Badge, Card, ErrorState, LoadingState, PageHeader } from '../components/ui';
import { decimalToChartNumber } from '../utils/chartAdapter';
import { decimalSign, formatMoney, formatPercent } from '../utils/money';

const frames = [['daily', 'Day'], ['weekly', 'Week'], ['monthly', 'Month'], ['6-month', '6 months'], ['annual', 'Year']] as const;

export default function DashboardPage() {
  const [timeframe, setTimeframe] = useState<(typeof frames)[number][0]>('monthly');
  const dashboard = useDashboard(timeframe);
  const me = useMe();
  if (dashboard.isPending) return <LoadingState label="Building your financial view…" />;
  if (dashboard.isError) return <ErrorState error={dashboard.error} retry={() => dashboard.refetch()} />;

  const data = dashboard.data;
  const currency = me.data?.baseCurrency ?? data.cashFlow[0]?.currency ?? 'EUR';
  const cash = data.cashFlow.find((item) => item.currency === currency);
  const utility = data.utilityImpact.find((item) => item.currency === currency);
  const assets = data.assetSummary.find((item) => item.currency === currency);
  const liabilities = data.liabilitySummary.find((item) => item.currency === currency);
  const labels = new Map<string, string>();
  const chart = new Map<string, { name: string; spending: number; income: number; utility: number; growth: number }>();
  const ensure = (bucket: string) => { if (!chart.has(bucket)) chart.set(bucket, { name: bucket.slice(0, 10), spending: 0, income: 0, utility: 0, growth: 0 }); return chart.get(bucket)!; };
  data.trends.actualCashFlow.filter((item) => item.currency === currency).forEach((item) => { const row = ensure(item.bucketStartLocal); row.spending = decimalToChartNumber(item.actualSpending); row.income = decimalToChartNumber(item.actualIncome); });
  data.trends.utilityImpact.filter((item) => item.currency === currency).forEach((item) => { ensure(item.bucketStartLocal).utility = decimalToChartNumber(item.utilityAdjustedCost); });
  data.trends.assetUnrealizedGainChange.filter((item) => item.currency === currency).forEach((item) => { ensure(item.bucketStartLocal).growth = decimalToChartNumber(item.unrealizedGainChange); });
  const chartRows = [...chart.values()];
  labels.set('spending', 'Actual spending'); labels.set('income', 'Income'); labels.set('utility', 'Utility impact'); labels.set('growth', 'Asset gain change');
  const name = me.data?.displayName.split(' ')[0] ?? '';
  const greeting = new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening';

  return <>
    <PageHeader eyebrow={`${formatBound(data.bounds.startLocal)} — ${formatBound(data.bounds.endLocalExclusive)} · ${data.bounds.timezone}`} title={`Good ${greeting}, ${name}`} description="Cash movement and lived financial utility, kept deliberately separate." />
    <div className="scroll-fade-x no-scrollbar mb-5 flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-brand/[.055] p-1" aria-label="Dashboard timeframe">{frames.map(([value, label]) => <button key={value} onClick={() => setTimeframe(value)} className={`control-press min-h-10 shrink-0 rounded-xl px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-[.98] ${timeframe === value ? 'bg-surface text-brand shadow-sm' : 'text-muted hover:bg-surface/50 hover:text-ink'}`}>{label}</button>)}</div>
    <div className="page-grid">
      <Metric className="col-span-12 sm:col-span-6 xl:col-span-3" icon={<ArrowUpRight />} label="Actual spending" value={formatMoney(cash?.actualSpending, currency)} detail="Cash that left for consumption" tone="expense" />
      <Metric className="col-span-12 sm:col-span-6 xl:col-span-3" icon={<ArrowDownRight />} label="Actual income" value={formatMoney(cash?.actualIncome, currency)} detail="Cash received in this period" tone="income" />
      <Metric className="col-span-12 sm:col-span-6 xl:col-span-3" icon={<Scale />} label="Net cash flow" value={formatMoney(cash?.ordinaryNetCashFlow, currency)} detail="Income minus ordinary spending" tone={decimalSign(cash?.ordinaryNetCashFlow) >= 0 ? 'income' : 'expense'} />
      <Metric className="col-span-12 sm:col-span-6 xl:col-span-3" icon={<Sparkles />} label="Utility-adjusted cost" value={formatMoney(utility?.utilityAdjustedCost, currency)} detail="Consumption impact across use days" tone="utility" />
    </div>
    <div className="mt-5 page-grid">
      <Card className="col-span-12 overflow-hidden xl:col-span-8"><div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold tracking-tight">Money movement vs. utility</h2><p className="mt-0.5 text-sm leading-relaxed text-muted">Visual estimates only; displayed totals above remain exact backend decimals.</p></div><Badge tone="info">{currency}</Badge></div>{chartRows.length ? <div className="h-72 w-full" role="img" aria-label="Income, spending, utility impact, and asset gain change over time"><ResponsiveContainer><AreaChart data={chartRows} margin={{ left: -16, right: 8 }}><defs><linearGradient id="income" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#27846f" stopOpacity=".35" /><stop offset="1" stopColor="#27846f" stopOpacity="0" /></linearGradient></defs><CartesianGrid vertical={false} stroke="#e7e4da" /><XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip formatter={(value, key) => [formatMoney(String(value), currency), labels.get(String(key)) ?? String(key)]} /><Legend formatter={(value) => labels.get(value) ?? value} /><Area type="monotone" dataKey="income" stroke="#27846f" fill="url(#income)" strokeWidth={2} /><Area type="monotone" dataKey="spending" stroke="#c85d45" fill="transparent" strokeWidth={2} /><Area type="monotone" dataKey="utility" stroke="#8f6bb3" fill="transparent" strokeWidth={2} strokeDasharray="5 4" /><Area type="monotone" dataKey="growth" stroke="#3273a8" fill="transparent" strokeWidth={2} /></AreaChart></ResponsiveContainer></div> : <div className="grid h-64 place-items-center text-sm text-muted">Your trends will appear after your first entries.</div>}</Card>
      <Card className="col-span-12 xl:col-span-4"><h2 className="font-bold tracking-tight">Long-term position</h2><div className="mt-5 grid gap-4"><Position icon={<BarChart3 />} label="Assets" value={formatMoney(assets?.currentValue, currency)} note={`${formatMoney(assets?.absoluteGainLoss, currency)} · ${formatPercent(assets?.simpleReturnPercentage)}`} /><Position icon={<Landmark />} label="Liabilities" value={formatMoney(liabilities?.outstandingBalance, currency)} note="Outstanding balance" /><Position icon={<WalletCards />} label="Invested principal" value={formatMoney(assets?.cumulativePrincipal, currency)} note="Cumulative contributions" /></div><p className="mt-6 rounded-2xl bg-brand/[.045] p-3 text-xs leading-relaxed text-muted">Market appreciation is not cash income. Asset purchases are shown separately from ordinary consumption.</p></Card>
    </div>
    <div className="mt-5 page-grid">
      <Card className="col-span-12 lg:col-span-6"><h2 className="font-bold tracking-tight">Spending by category</h2><div className="mt-4 grid gap-1">{data.spendingByCategory.filter((item) => item.currency === currency).length ? data.spendingByCategory.filter((item) => item.currency === currency).slice(0, 8).map((item) => <div key={item.categoryId ?? 'none'} className="flex items-center justify-between gap-4 rounded-xl px-2 py-2 hover:bg-brand/[.035]"><span className="truncate text-sm text-muted">{item.categoryName}</span><strong className="money-value text-sm">{formatMoney(item.actualSpending, currency)}</strong></div>) : <p className="py-8 text-center text-sm text-muted">No spending in this period.</p>}</div></Card>
      <Card className="col-span-12 lg:col-span-6"><h2 className="font-bold tracking-tight">Account balances</h2><div className="mt-4 grid gap-1">{data.accountBalances.length ? data.accountBalances.map((item) => <div key={item.accountId} className="flex items-center justify-between gap-4 rounded-xl px-2 py-2 hover:bg-brand/[.035]"><div><p className="text-sm font-semibold">{item.name}</p><p className="text-xs text-muted">{item.currency}</p></div><strong className="money-value">{formatMoney(item.currentBalance, item.currency)}</strong></div>) : <p className="py-8 text-center text-sm text-muted">Create an account to begin.</p>}</div></Card>
    </div>
  </>;
}

function formatBound(value: string) {
  const date = value.slice(0, 10);
  const [year, month, day] = date.split('-').map((part) => Number(part));
  if (!year || !month || !day) return date;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)));
}

function Metric({ className, icon, label, value, detail, tone }: { className: string; icon: React.ReactNode; label: string; value: string; detail: string; tone: 'income' | 'expense' | 'utility' }) { return <Card className={`card-lift overflow-hidden ${className}`}><div aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 ${tone === 'income' ? 'bg-emerald-500' : tone === 'expense' ? 'bg-rose-500' : 'bg-violet-500'}`} /><div className={`mb-5 grid size-10 place-items-center rounded-2xl ring-1 ring-inset ring-black/[.035] ${tone === 'income' ? 'bg-emerald-50 text-emerald-800' : tone === 'expense' ? 'bg-rose-50 text-rose-800' : 'bg-violet-50 text-violet-800'}`}>{icon}</div><p className="text-sm font-medium text-muted">{label}</p><p className="money-value mt-1 text-2xl font-bold tracking-tight">{value}</p><p className="mt-2 text-xs leading-relaxed text-muted">{detail}</p></Card>; }
function Position({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) { return <div className="flex items-center gap-3 rounded-2xl p-1"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand/[.07] text-brand ring-1 ring-inset ring-brand/[.06]">{icon}</span><div className="min-w-0"><p className="text-xs text-muted">{label}</p><p className="money-value truncate font-bold">{value}</p><p className="truncate text-xs text-muted">{note}</p></div></div>; }
