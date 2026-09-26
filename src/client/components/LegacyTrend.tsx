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
