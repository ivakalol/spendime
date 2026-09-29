// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import DashboardPage from '../../src/client/pages/DashboardPage';

const useDashboard = vi.fn();
vi.mock('../../src/client/api/queries',()=>({
  useMe:()=>({data:{baseCurrency:'EUR',timezone:'UTC',displayName:'Test',onboardingCompletedAt:'2026-01-01'}}),
  useDashboard:(...args:unknown[])=>useDashboard(...args),
  useSavePreferences:()=>({mutate:vi.fn()}),
}));
vi.mock('../../src/client/pages/AccountsPage',()=>({AccountDialog:()=>null}));
vi.mock('recharts',()=>({ResponsiveContainer:({children}:any)=>children,AreaChart:({children}:any)=>children,Area:()=>null,CartesianGrid:()=>null,XAxis:()=>null,YAxis:()=>null,Tooltip:()=>null,PieChart:({children}:any)=>children,Pie:()=>null,Cell:()=>null}));

const data={timeframe:'this-week',bounds:{startLocal:'2026-09-28',endLocalExclusive:'2026-09-30',timezone:'UTC'},comparisonBounds:{startLocal:'2026-09-26',endLocalExclusive:'2026-09-28'},assetSummary:[],liabilitySummary:[],cashFlow:[],balanceTotals:[],previousCashFlow:[],accountBalances:[],recentTransactions:[],spendingByCategory:[],utilityImpact:[],trends:{actualCashFlow:[],utilityImpact:[]}};
afterEach(()=>{cleanup();localStorage.clear();useDashboard.mockReset();});

it('restores the selected dashboard period when reopened',()=>{
  useDashboard.mockReturnValue({data,isPending:false,isError:false});
  const open=()=>render(<MemoryRouter><DashboardPage/></MemoryRouter>);
  const first=open();
  fireEvent.change(screen.getByLabelText('Period'),{target:{value:'this-week'}});
  expect(localStorage.getItem('spendime.dashboard.period')).toBe('this-week');
  first.unmount();
  open();
  expect((screen.getByLabelText('Period') as HTMLSelectElement).value).toBe('this-week');
  expect(useDashboard).toHaveBeenLastCalledWith('this-week',undefined,undefined,undefined);
});

it('restores applied custom dates with the period',()=>{
  useDashboard.mockReturnValue({data,isPending:false,isError:false});
  const open=()=>render(<MemoryRouter><DashboardPage/></MemoryRouter>);
  const first=open();
  fireEvent.change(screen.getByLabelText('Period'),{target:{value:'custom'}});
  fireEvent.change(screen.getByLabelText('From'),{target:{value:'2026-02-01'}});
  fireEvent.change(screen.getByLabelText('Through'),{target:{value:'2026-02-28'}});
  fireEvent.click(screen.getByRole('button',{name:'Apply dates'}));
  first.unmount();
  open();
  expect((screen.getByLabelText('Period') as HTMLSelectElement).value).toBe('custom');
  expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('2026-02-01');
  expect((screen.getByLabelText('Through') as HTMLInputElement).value).toBe('2026-02-28');
  expect(useDashboard).toHaveBeenLastCalledWith('custom',undefined,'2026-02-01','2026-02-28');
});
