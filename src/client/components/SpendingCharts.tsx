import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DashboardData } from '../api/types';
import { categoryBreakdown } from '../utils/analytics';
import { addCalendarDays } from '../utils/dateTime';
import { formatMoney } from '../utils/money';
import { Card, Field, Select } from './ui';

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

export function SpendingTrend({ data, currency }: { data: DashboardData; currency: string }) {
  const [view, setView] = useState('both');
  const showSpending = view !== 'income';
  const showIncome = view !== 'spending';
  const description = view === 'both' ? 'Income and spending after refunds' : view === 'income' ? 'Income' : 'Spending after refunds';
  const monthly = ['annual','6-month','this-year'].includes(data.timeframe);
  const points = new Map(data.trends.actualCashFlow.filter(row=>row.currency===currency).map(row=>[row.bucketStartLocal.slice(0,10),row]));
  const rows = [];
  for(let day=data.bounds.startLocal.slice(0,10);day<data.bounds.endLocalExclusive.slice(0,10);day=monthly?`${Number(day.slice(0,4))+(day.slice(5,7)==='12'?1:0)}-${String(Number(day.slice(5,7))%12+1).padStart(2,'0')}-01`:addCalendarDays(day,1)) {
    const point=points.get(day);
    rows.push({date:day,spending:Number(point?.actualSpending??0),income:Number(point?.actualIncome??0),exactSpending:point?.actualSpending??'0',exactIncome:point?.actualIncome??'0'});
  }
  return <Card className="min-w-0"><h2 className="font-bold">Money over time</h2><p className="mt-1 text-sm text-muted">{description} · {currency}</p><div className="mt-4"><Field label="Show on chart"><Select value={view} onChange={event=>setView(event.target.value)}><option value="both">Spending and income</option><option value="spending">Spending only</option><option value="income">Income only</option></Select></Field></div>
    {points.size ? <><div className="mt-6 h-64" role="img" aria-label={`${description} over time in ${currency}; values available in the table below.`}><ResponsiveContainer><AreaChart data={rows} margin={{left:0,right:12}}><CartesianGrid vertical={false} stroke="#e2e5df"/><XAxis dataKey="date" tickFormatter={value=>value.slice(5)} tick={{fontSize:11}} minTickGap={24}/><YAxis width={45} tick={{fontSize:11}}/><Tooltip formatter={(_,key,entry)=>[formatMoney(key==='Spending'?entry.payload.exactSpending:entry.payload.exactIncome,currency),key]}/>{showIncome && <Area type="linear" dataKey="income" name="Income" stroke="#205b50" fill="#205b50" fillOpacity={.06} strokeDasharray="4 3"/>}{showSpending && <Area type="linear" dataKey="spending" name="Spending" stroke="#c27647" fill="#c27647" fillOpacity={.12}/>}</AreaChart></ResponsiveContainer></div><p className="mt-3 text-sm text-muted">{showSpending && '— Spending'}{showSpending && showIncome && ' / '}{showIncome && '┄ Income'}</p><details className="mt-3 text-sm"><summary className="cursor-pointer py-2 font-semibold">View chart values</summary><div className="max-h-56 overflow-auto"><table className="w-full text-left"><caption className="sr-only">Exact trend values in {currency}</caption><thead><tr><th scope="col">Date</th>{showSpending && <th scope="col">Spending</th>}{showIncome && <th scope="col">Income</th>}</tr></thead><tbody>{rows.map(row=><tr key={row.date}><th scope="row" className="py-2 font-normal">{row.date}</th>{showSpending && <td>{formatMoney(row.exactSpending,currency)}</td>}{showIncome && <td>{formatMoney(row.exactIncome,currency)}</td>}</tr>)}</tbody></table></div></details></> : <p className="py-20 text-center text-sm text-muted">Your income and spending trend will appear here after your first transaction in this period.</p>}
  </Card>;
}
