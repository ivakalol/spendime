// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { SpendingTrend } from '../../src/client/components/SpendingCharts';
import type { DashboardData } from '../../src/client/api/types';
vi.mock('recharts', () => ({ ResponsiveContainer: ({children}:any)=>children, AreaChart:({children}:any)=>children, Area:({name}:any)=><span data-testid="series">{name}</span>, CartesianGrid:()=>null, XAxis:()=>null, YAxis:()=>null, Tooltip:()=>null }));
it('lets users show either series and matching accessible table columns',()=>{
 const data={timeframe:'this-week',bounds:{startLocal:'2026-03-09',endLocalExclusive:'2026-03-10'},trends:{actualCashFlow:[{currency:'EUR',bucketStartLocal:'2026-03-09',actualSpending:'10',actualIncome:'20'}]}} as DashboardData;
 render(<SpendingTrend data={data} currency="EUR"/>);
 expect(screen.getAllByTestId('series').map(el=>el.textContent)).toEqual(['Income','Spending']);
 fireEvent.change(screen.getByLabelText('Show on chart'),{target:{value:'spending'}});
 expect(screen.getAllByTestId('series').map(el=>el.textContent)).toEqual(['Spending']);
 expect(screen.queryByRole('columnheader',{name:'Income'})).toBeNull();
 fireEvent.change(screen.getByLabelText('Show on chart'),{target:{value:'income'}});
 expect(screen.getAllByTestId('series').map(el=>el.textContent)).toEqual(['Income']);
 expect(screen.queryByRole('columnheader',{name:'Spending'})).toBeNull();
});

