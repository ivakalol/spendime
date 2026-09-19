import { ArrowDownRight, ArrowUpRight, BarChart3, Landmark, Scale, Sparkles, WalletCards } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useDashboard, useMe } from '../api/queries';
import { Badge, Card, ErrorState, LoadingState, PageHeader } from '../components/ui';
import { decimalToChartNumber } from '../utils/chartAdapter';
import { decimalSign, formatMoney, formatPercent } from '../utils/money';
import { useLanguage } from '../i18n';

const frames = [['daily', 'Day'], ['weekly', 'Week'], ['monthly', 'Month'], ['6-month', '6 months'], ['annual', 'Year']] as const;
const series = [
  { key: 'growth', label: 'Asset gain change', color: '#3273a8' },
  { key: 'income', label: 'Income', color: '#27846f' },
  { key: 'spending', label: 'Actual spending', color: '#c85d45' },
  { key: 'utility', label: 'Utility impact', color: '#8f6bb3' },
] as const;
type SeriesKey = (typeof series)[number]['key'];
type ChartRow = { name: string; spending: number; income: number; utility: number; growth: number };
const seriesStorageKey = 'spendime.dashboard.series';
const defaultVisible: Record<SeriesKey, boolean> = { growth:true, income:true, spending:true, utility:true };
function savedSeries(): Record<SeriesKey, boolean> {
  try {
    const stored = JSON.parse(localStorage.getItem(seriesStorageKey) ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(series.map(({key})=>[key,stored[key] === false ? false : true])) as Record<SeriesKey, boolean>;
  } catch {
    return { ...defaultVisible };
  }
}

export default function DashboardPage() {
  const [timeframe, setTimeframe] = useState<(typeof frames)[number][0]>('monthly');
  const dashboard = useDashboard(timeframe);
  const me = useMe();
  const { language, t } = useLanguage();
  if (dashboard.isPending) return <LoadingState label={t('Building your financial view…')} />;
  if (dashboard.isError) return <ErrorState error={dashboard.error} retry={() => dashboard.refetch()} />;

  const data = dashboard.data;
  const currency = me.data?.baseCurrency ?? data.cashFlow[0]?.currency ?? 'EUR';
  const cash = data.cashFlow.find((item) => item.currency === currency);
  const utility = data.utilityImpact.find((item) => item.currency === currency);
  const assets = data.assetSummary.find((item) => item.currency === currency);
  const liabilities = data.liabilitySummary.find((item) => item.currency === currency);
  const chart = new Map<string, ChartRow>();
  const ensure = (bucket: string) => { if (!chart.has(bucket)) chart.set(bucket, { name: bucket.slice(0, 10), spending: 0, income: 0, utility: 0, growth: 0 }); return chart.get(bucket)!; };
  data.trends.actualCashFlow.filter((item) => item.currency === currency).forEach((item) => { const row = ensure(item.bucketStartLocal); row.spending = decimalToChartNumber(item.actualSpending); row.income = decimalToChartNumber(item.actualIncome); });
  data.trends.utilityImpact.filter((item) => item.currency === currency).forEach((item) => { ensure(item.bucketStartLocal).utility = decimalToChartNumber(item.utilityAdjustedCost); });
  data.trends.assetUnrealizedGainChange.filter((item) => item.currency === currency).forEach((item) => { ensure(item.bucketStartLocal).growth = decimalToChartNumber(item.unrealizedGainChange); });
  const chartRows = [...chart.values()];
  const name = me.data?.displayName.split(' ')[0] ?? '';
  const greeting = new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening';

  return <>
    <PageHeader eyebrow={`${formatBound(data.bounds.startLocal, language)} — ${formatBound(data.bounds.endLocalExclusive, language)} · ${data.bounds.timezone}`} title={t(`Good ${greeting}, {name}`, {name})} description={t('Cash movement and lived financial utility, kept deliberately separate.')} />
    <div className="scroll-fade-x no-scrollbar mb-5 flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-brand/[.055] p-1" aria-label="Dashboard timeframe">{frames.map(([value, label]) => <button key={value} onClick={() => setTimeframe(value)} className={`control-press min-h-10 shrink-0 rounded-xl px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-[.98] ${timeframe === value ? 'bg-surface text-brand shadow-sm' : 'text-muted hover:bg-surface/50 hover:text-ink'}`}>{t(label)}</button>)}</div>
    <div className="page-grid">
      <Metric className="col-span-12 sm:col-span-6 xl:col-span-3" icon={<ArrowUpRight />} label={t('Actual spending')} value={formatMoney(cash?.actualSpending, currency)} detail={t('Cash that left for consumption')} tone="expense" />
      <Metric className="col-span-12 sm:col-span-6 xl:col-span-3" icon={<ArrowDownRight />} label={t('Actual income')} value={formatMoney(cash?.actualIncome, currency)} detail={t('Cash received in this period')} tone="income" />
      <Metric className="col-span-12 sm:col-span-6 xl:col-span-3" icon={<Scale />} label={t('Net cash flow')} value={formatMoney(cash?.ordinaryNetCashFlow, currency)} detail={t('Income minus ordinary spending')} tone={decimalSign(cash?.ordinaryNetCashFlow) >= 0 ? 'income' : 'expense'} />
      <Metric className="col-span-12 sm:col-span-6 xl:col-span-3" icon={<Sparkles />} label={t('Utility-adjusted cost')} value={formatMoney(utility?.utilityAdjustedCost, currency)} detail={t('Consumption impact across use days')} tone="utility" />
    </div>
    <div className="mt-5 page-grid">
      <TrendChart rows={chartRows} currency={currency} />
      <Card className="col-span-12 xl:col-span-4"><h2 className="font-bold tracking-tight">{t('Long-term position')}</h2><div className="mt-5 grid gap-4"><Position icon={<BarChart3 />} label={t('Assets')} value={formatMoney(assets?.currentValue, currency)} note={`${formatMoney(assets?.absoluteGainLoss, currency)} · ${formatPercent(assets?.simpleReturnPercentage)}`} /><Position icon={<Landmark />} label={t('Liabilities')} value={formatMoney(liabilities?.outstandingBalance, currency)} note={t('Outstanding balance')} /><Position icon={<WalletCards />} label={t('Invested principal')} value={formatMoney(assets?.cumulativePrincipal, currency)} note={t('Cumulative contributions')} /></div><p className="mt-6 rounded-2xl bg-brand/[.045] p-3 text-xs leading-relaxed text-muted">{t('Market appreciation is not cash income. Asset purchases are shown separately from ordinary consumption.')}</p></Card>
    </div>
    <div className="mt-5 page-grid">
      <Card className="col-span-12 lg:col-span-6"><h2 className="font-bold tracking-tight">{t('Spending by category')}</h2><div className="mt-4 grid gap-1">{data.spendingByCategory.filter((item) => item.currency === currency).length ? data.spendingByCategory.filter((item) => item.currency === currency).slice(0, 8).map((item) => <div key={item.categoryId ?? 'none'} className="flex items-center justify-between gap-4 rounded-xl px-2 py-2 hover:bg-brand/[.035]"><span className="truncate text-sm text-muted">{item.categoryName}</span><strong className="money-value text-sm">{formatMoney(item.actualSpending, currency)}</strong></div>) : <p className="py-8 text-center text-sm text-muted">{t('No spending in this period.')}</p>}</div></Card>
      <Card className="col-span-12 lg:col-span-6"><h2 className="font-bold tracking-tight">{t('Account balances')}</h2><div className="mt-4 grid gap-1">{data.accountBalances.length ? data.accountBalances.map((item) => <div key={item.accountId} className="flex items-center justify-between gap-4 rounded-xl px-2 py-2 hover:bg-brand/[.035]"><div><p className="text-sm font-semibold">{item.name}</p><p className="text-xs text-muted">{item.currency}</p></div><strong className="money-value">{formatMoney(item.currentBalance, item.currency)}</strong></div>) : <p className="py-8 text-center text-sm text-muted">{t('Create an account to begin.')}</p>}</div></Card>
    </div>
  </>;
}

export function TrendChart({ rows, currency }: { rows: ChartRow[]; currency: string }) {
  const {t}=useLanguage();
  const [visible, setVisible]=useState<Record<SeriesKey, boolean>>(savedSeries);
  useEffect(()=>{localStorage.setItem(seriesStorageKey,JSON.stringify(visible));},[visible]);
  const selected=series.filter(({key})=>visible[key]);
  const labels=new Map(series.map(({key,label})=>[key,t(label)]));

  return <Card className="col-span-12 min-w-0 overflow-hidden xl:col-span-8">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold tracking-tight">{t('Money movement vs. utility')}</h2><p className="mt-0.5 text-sm leading-relaxed text-muted">{t('Visual estimates only; displayed totals above remain exact backend decimals.')}</p></div><Badge tone="info">{currency}</Badge></div>
    {rows.length ? <>
      {selected.length ? <div className="h-64 min-w-0 w-full" role="img" aria-label={t('Selected financial trends over time')}><ResponsiveContainer><AreaChart data={rows} margin={{ left: -16, right: 8 }}><defs><linearGradient id="income" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#27846f" stopOpacity=".35" /><stop offset="1" stopColor="#27846f" stopOpacity="0" /></linearGradient></defs><CartesianGrid vertical={false} stroke="#e7e4da" /><XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip formatter={(value, key) => [formatMoney(String(value), currency), labels.get(String(key) as SeriesKey) ?? String(key)]} />{selected.map(({key,color})=><Area key={key} type="monotone" dataKey={key} name={labels.get(key)} stroke={color} fill={key==='income'?'url(#income)':'transparent'} strokeWidth={2} strokeDasharray={key==='utility'?'5 4':undefined} />)}</AreaChart></ResponsiveContainer></div> : <div className="grid h-64 place-items-center text-center text-sm text-muted">{t('Select a trend to show it on the chart.')}</div>}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2" role="group" aria-label={t('Chart series')}>{series.map(({key,label,color})=><label key={key} className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-1 text-sm font-medium text-muted hover:text-ink"><input type="checkbox" checked={visible[key]} onChange={(event)=>setVisible((current)=>({...current,[key]:event.target.checked}))} className="size-4 shrink-0 accent-brand" /><span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{backgroundColor:color}} /><span>{t(label)}</span></label>)}</div>
    </> : <div className="grid h-64 place-items-center text-sm text-muted">{t('Your trends will appear after your first entries.')}</div>}
  </Card>;
}

function formatBound(value: string, language: 'en'|'bg') {
  const date = value.slice(0, 10);
  const [year, month, day] = date.split('-').map((part) => Number(part));
  if (!year || !month || !day) return date;
  return new Intl.DateTimeFormat(language === 'bg' ? 'bg-BG' : 'en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)));
}

function Metric({ className, icon, label, value, detail, tone }: { className: string; icon: React.ReactNode; label: string; value: string; detail: string; tone: 'income' | 'expense' | 'utility' }) { return <Card className={`card-lift overflow-hidden ${className}`}><div aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 ${tone === 'income' ? 'bg-emerald-500' : tone === 'expense' ? 'bg-rose-500' : 'bg-violet-500'}`} /><div className={`mb-5 grid size-10 place-items-center rounded-2xl ring-1 ring-inset ring-black/[.035] ${tone === 'income' ? 'bg-emerald-50 text-emerald-800' : tone === 'expense' ? 'bg-rose-50 text-rose-800' : 'bg-violet-50 text-violet-800'}`}>{icon}</div><p className="text-sm font-medium text-muted">{label}</p><p className="money-value mt-1 text-2xl font-bold tracking-tight">{value}</p><p className="mt-2 text-xs leading-relaxed text-muted">{detail}</p></Card>; }
function Position({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) { return <div className="flex items-center gap-3 rounded-2xl p-1"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand/[.07] text-brand ring-1 ring-inset ring-brand/[.06]">{icon}</span><div className="min-w-0"><p className="text-xs text-muted">{label}</p><p className="money-value truncate font-bold">{value}</p><p className="truncate text-xs text-muted">{note}</p></div></div>; }
