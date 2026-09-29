// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SpendingTrend } from '../../src/client/components/SpendingCharts';
import type { DashboardData } from '../../src/client/api/types';

vi.mock('recharts', () => ({ ResponsiveContainer: ({children}:any)=>children, AreaChart:({children}:any)=>children, Area:({name}:any)=><span data-testid="series">{name}</span>, CartesianGrid:()=>null, XAxis:()=>null, YAxis:()=>null, Tooltip:()=>null }));
afterEach(()=>{cleanup();localStorage.clear();});
const data={timeframe:'custom',bounds:{startLocal:'2026-03-09',endLocalExclusive:'2026-03-11'},trends:{actualCashFlow:[{currency:'EUR',bucketStartLocal:'2026-03-09',actualSpending:'30',actualIncome:'20'}],utilityImpact:[{currency:'EUR',bucketStartLocal:'2026-03-09',utilityAdjustedCost:'1'},{currency:'EUR',bucketStartLocal:'2026-03-10',utilityAdjustedCost:'1'}]}} as DashboardData;
const series=()=>screen.getAllByTestId('series').map(el=>el.textContent);

it('supports independent chart series and keeps one enabled',()=>{
 const {unmount}=render(<SpendingTrend data={data} currency="EUR" period="week"/>);
 expect(series()).toEqual(['Income','Spending']);
 fireEvent.click(screen.getByRole('checkbox',{name:'Income'}));
 fireEvent.click(screen.getByRole('checkbox',{name:'Cost spread over use days'}));
 expect(series()).toEqual(['Spending','Cost spread over use days']);
 expect(screen.queryByRole('columnheader',{name:'Income'})).toBeNull();
 fireEvent.click(screen.getByRole('checkbox',{name:'Spending'}));
 expect(series()).toEqual(['Cost spread over use days']);
 fireEvent.click(screen.getByRole('checkbox',{name:'Cost spread over use days'}));
 expect(series()).toEqual(['Cost spread over use days']);
 expect(screen.getAllByText(/1[.,]00/)).toHaveLength(2);
 unmount();
 render(<SpendingTrend data={data} currency="EUR" period="week"/>);
 expect(series()).toEqual(['Cost spread over use days']);
});

it('aggregates year and Total chart points by month while retaining exact values',()=>{
 render(<SpendingTrend data={data} currency="EUR" period="year"/>);
 expect(screen.getByRole('columnheader',{name:'Month'})).toBeTruthy();
 expect(screen.getByRole('rowheader',{name:'2026-03'})).toBeTruthy();
 expect(screen.getByText(/30[.,]00/)).toBeTruthy();
});
