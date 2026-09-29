import { useEffect, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DashboardData } from '../api/types';
import { categoryBreakdown } from '../utils/analytics';
import { addCalendarDays } from '../utils/dateTime';
import { formatMoney } from '../utils/money';
import { Card } from './ui';
import { useLanguage } from '../i18n';

const colors = ['#205b50', '#c27647', '#497ea0', '#8c6398', '#a0802d', '#517c67', '#ba5363', '#75848b'];
export function SpendingDonut({ rows, currency }: { rows: DashboardData['spendingByCategory']; currency: string }) {
  const breakdown = categoryBreakdown(rows, currency);
  const [selected, setSelected] = useState<string | null>(null);
  return <Card className="min-w-0"><h2 className="font-bold">Where your money went</h2><p className="mt-1 text-sm text-muted">Spending by category · {currency}</p>
    {breakdown.slices.length ? <>
      <div className="relative h-60" role="img" aria-label={`Spending proportions in ${currency}. Exact values and percentages listed below.`}>
        <ResponsiveContainer><PieChart><Pie data={breakdown.slices} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={2} isAnimationActive={false} onClick={slice=>setSelected(slice.name??null)}>
          {breakdown.slices.map((slice,index)=><Cell key={slice.name} fill={colors[index]} opacity={selected && selected!==slice.name ? .4 : 1}/>)}</Pie>
          <Tooltip formatter={(_,__,entry)=>`${formatMoney(entry.payload.exact,currency)} · ${entry.payload.percentage}`}/></PieChart></ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid content-center text-center"><span className="text-xs text-muted">Category total</span><strong className="money-value text-xl">{formatMoney(breakdown.total,currency)}</strong></div>
      </div>
      <ul className="grid gap-1" aria-label="Category values and percentages">{breakdown.slices.map((slice,index)=><li key={slice.name}><button type="button" aria-pressed={selected===slice.name} onClick={()=>setSelected(selected===slice.name?null:slice.name)} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-left text-sm hover:bg-brand/5"><span aria-hidden className="size-3 shrink-0 rounded-full" style={{background:colors[index]}}/><span className="min-w-0 flex-1 break-words">{slice.name}</span><span className="text-muted">{slice.percentage}</span><strong className="money-value">{formatMoney(slice.exact,currency)}</strong></button></li>)}</ul>
      {breakdown.other.length>0 && <details className="mt-3 text-sm"><summary className="cursor-pointer py-2 font-semibold">Inside Other categories</summary>{breakdown.other.map(row=><p className="flex justify-between gap-2 py-1" key={row.categoryId??'none'}><span>{row.categoryName}</span><span>{formatMoney(row.actualSpending,currency)}</span></p>)}</details>}
    </> : <p className="py-12 text-center text-sm text-muted">No positive spending in this period. Add an expense or choose another period to see your breakdown.</p>}
    {breakdown.refunds.length>0 && <div className="mt-4 border-t border-brand/10 pt-3 text-sm"><p className="mb-2 text-muted">These categories had more refunds than spending. They reduce net spending above and are excluded from donut proportions.</p>{breakdown.refunds.map(row=><p className="flex justify-between gap-2 py-1" key={row.categoryId??'none'}><span>{row.categoryName}</span><strong>{formatMoney(row.actualSpending,currency)}</strong></p>)}</div>}
  </Card>;
}

type Series = 'spending'|'income'|'cost';
type VisibleSeries = Record<Series,boolean>;
const chartStorageKey='spendime.dashboard.chartSeries';
function savedSeries():VisibleSeries {
  try {
    const stored=JSON.parse(localStorage.getItem(chartStorageKey)??'null');
    if(stored && typeof stored==='object') {
      const result={spending:stored.spending===true,income:stored.income===true,cost:stored.cost===true};
      if(Object.values(result).some(Boolean)) return result;
    }
    const old=localStorage.getItem('spendime.dashboard.chartView');
    if(old==='spending') return {spending:true,income:false,cost:false};
    if(old==='income') return {spending:false,income:true,cost:false};
    if(old==='spending-cost') return {spending:true,income:false,cost:true};
    if(old==='cost') return {spending:false,income:false,cost:true};
    if(old==='all') return {spending:true,income:true,cost:true};
  } catch { /* Browser storage may be unavailable. */ }
  return {spending:true,income:true,cost:false};
}
function scaled(value:string):bigint {
  const negative=value.startsWith('-');
  const [whole='0',fraction='']=value.replace(/^[+-]/,'').split('.');
  return BigInt(whole+fraction.padEnd(6,'0').slice(0,6))*(negative?-1n:1n);
}
function unscaled(value:bigint):string {
  const absolute=(value<0n?-value:value).toString().padStart(7,'0');
  return `${value<0n?'-':''}${absolute.slice(0,-6)}.${absolute.slice(-6)}`;
}
function nextMonth(date:string):string {
  const year=Number(date.slice(0,4)),month=Number(date.slice(5,7));
  return `${year+(month===12?1:0)}-${String(month===12?1:month+1).padStart(2,'0')}-01`;
}

export function SpendingTrend({ data, currency, period }: { data: DashboardData; currency: string; period: 'day'|'week'|'month'|'year'|'total' }) {
  const {t}=useLanguage();
  const [visible,setVisible]=useState<VisibleSeries>(savedSeries);
  useEffect(()=>{try { localStorage.setItem(chartStorageKey,JSON.stringify(visible)); } catch {}},[visible]);
  const toggle=(key:Series,checked:boolean)=>setVisible(current=>{
    if(!checked && Object.values(current).filter(Boolean).length===1) return current;
    return {...current,[key]:checked};
  });
  const monthly=period==='year'||period==='total';
  const actual=data.trends.actualCashFlow.filter(row=>row.currency===currency);
  const utility=data.trends.utilityImpact.filter(row=>row.currency===currency);
  const daily=new Map<string,{spending:bigint;income:bigint;cost:bigint}>();
  const bucket=(date:string)=>{
    const key=monthly?`${date.slice(0,7)}-01`:date.slice(0,10);
    const value=daily.get(key)??{spending:0n,income:0n,cost:0n};
    daily.set(key,value);
    return value;
  };
  actual.forEach(row=>{const value=bucket(row.bucketStartLocal);value.spending+=scaled(row.actualSpending);value.income+=scaled(row.actualIncome);});
  utility.forEach(row=>{bucket(row.bucketStartLocal).cost+=scaled(row.utilityAdjustedCost);});
  const meaningfulKeys=[...daily.entries()].filter(([,value])=>(visible.spending&&value.spending!==0n)||(visible.income&&value.income!==0n)||(visible.cost&&value.cost!==0n)).map(([key])=>key).sort();
  const first=data.bounds.startLocal.slice(0,10),last=addCalendarDays(data.bounds.endLocalExclusive.slice(0,10),-1);
  const start=period==='total' && meaningfulKeys.length ? (meaningfulKeys[0]??first) : monthly?`${first.slice(0,7)}-01`:first;
  const end=monthly?`${last.slice(0,7)}-01`:last;
  const rows=[];
  for(let day=start;day<=end;day=monthly?nextMonth(day):addCalendarDays(day,1)) {
    const value=daily.get(day)??{spending:0n,income:0n,cost:0n};
    const exactSpending=unscaled(value.spending),exactIncome=unscaled(value.income),exactCost=unscaled(value.cost);
    rows.push({date:day,spending:Number(exactSpending),income:Number(exactIncome),cost:Number(exactCost),exactSpending,exactIncome,exactCost});
  }
  const series=[
    {key:'spending' as const,label:'Spending',color:'#c27647'},
    {key:'income' as const,label:'Income',color:'#205b50'},
    {key:'cost' as const,label:'Cost spread over use days',color:'#8f6bb3'},
  ];
  return <Card className="min-w-0">
    <h2 className="font-bold">Money over time</h2>
    <p className="mt-1 text-sm text-muted">{t('Selected trends')} · {currency}</p>
    <div role="group" aria-label={t('Chart series')} className="mt-4 flex flex-wrap gap-2">
      {series.map(({key,label,color})=><label key={key} className="cursor-pointer">
        <input type="checkbox" className="peer sr-only" checked={visible[key]} onChange={event=>toggle(key,event.target.checked)}/>
        <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-brand/15 px-3 text-sm font-semibold text-muted transition-colors hover:border-brand/30 peer-checked:border-brand peer-checked:bg-brand peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{backgroundColor:color}}/>{t(label)}
        </span>
      </label>)}
    </div>
    <p className="mt-3 text-xs leading-relaxed text-muted">Actual spending is recorded on the purchase date. Cost spread over use days distributes amortized purchases across their use period.</p>
    {meaningfulKeys.length ? <>
      <div className="mt-6 h-64" role="img" aria-label={`${t('Selected trends')} over time in ${currency}; values available in the table below.`}>
        <ResponsiveContainer><AreaChart data={rows} margin={{left:0,right:12}}>
          <CartesianGrid vertical={false} stroke="#e2e5df"/>
          <XAxis dataKey="date" tickFormatter={value=>monthly?value.slice(0,7):value.slice(5)} tick={{fontSize:11}} minTickGap={24}/>
          <YAxis width={45} tick={{fontSize:11}}/>
          <Tooltip formatter={(_,key,entry)=>[formatMoney(entry.dataKey==='spending'?entry.payload.exactSpending:entry.dataKey==='income'?entry.payload.exactIncome:entry.payload.exactCost,currency),key]}/>
          {visible.income&&<Area type="linear" dataKey="income" name={t('Income')} stroke="#205b50" fill="#205b50" fillOpacity={.06} strokeDasharray="4 3" dot={rows.length===1}/>}
          {visible.spending&&<Area type="linear" dataKey="spending" name={t('Spending')} stroke="#c27647" fill="#c27647" fillOpacity={.12} dot={rows.length===1}/>}
          {visible.cost&&<Area type="linear" dataKey="cost" name={t('Cost spread over use days')} stroke="#8f6bb3" fill="#8f6bb3" fillOpacity={.06} strokeDasharray="5 4" dot={rows.length===1}/>}
        </AreaChart></ResponsiveContainer>
      </div>
      <details className="mt-3 text-sm"><summary className="cursor-pointer py-2 font-semibold">View chart values</summary>
        <div className="max-h-56 overflow-auto"><table className="w-full text-left"><caption className="sr-only">Exact trend values in {currency}</caption>
          <thead><tr><th scope="col">{monthly?t('Month'):t('Date')}</th>{visible.spending&&<th scope="col">{t('Spending')}</th>}{visible.income&&<th scope="col">{t('Income')}</th>}{visible.cost&&<th scope="col">{t('Cost spread over use days')}</th>}</tr></thead>
          <tbody>{rows.map(row=><tr key={row.date}><th scope="row" className="py-2 font-normal">{monthly?row.date.slice(0,7):row.date}</th>{visible.spending&&<td>{formatMoney(row.exactSpending,currency)}</td>}{visible.income&&<td>{formatMoney(row.exactIncome,currency)}</td>}{visible.cost&&<td>{formatMoney(row.exactCost,currency)}</td>}</tr>)}</tbody>
        </table></div>
      </details>
    </> : <p className="py-20 text-center text-sm text-muted">Your income and spending trend will appear here after your first transaction in this period.</p>}
  </Card>;
}
