// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import DashboardPage, { dashboardWindow } from '../../src/client/pages/DashboardPage';
import { todayInTimezone } from '../../src/client/utils/dateTime';

const useDashboard=vi.fn(),useTransactions=vi.fn();
vi.mock('../../src/client/api/queries',()=>({
  useMe:()=>({data:{baseCurrency:'EUR',timezone:'UTC',displayName:'Test',onboardingCompletedAt:'2026-01-01'}}),
  useDashboard:(...args:unknown[])=>useDashboard(...args),
  useTransactions:(...args:unknown[])=>useTransactions(...args),
  useSavePreferences:()=>({mutate:vi.fn()}),
}));
vi.mock('../../src/client/pages/AccountsPage',()=>({AccountDialog:()=>null}));
vi.mock('recharts',()=>({ResponsiveContainer:({children}:any)=>children,AreaChart:({children}:any)=>children,Area:()=>null,CartesianGrid:()=>null,XAxis:()=>null,YAxis:()=>null,Tooltip:()=>null,PieChart:({children}:any)=>children,Pie:()=>null,Cell:()=>null}));

const data={timeframe:'custom',bounds:{startLocal:'2026-09-28',endLocalExclusive:'2026-09-30',timezone:'UTC'},comparisonBounds:{startLocal:'2026-09-26',endLocalExclusive:'2026-09-28'},assetSummary:[],liabilitySummary:[],cashFlow:[],balanceTotals:[],previousCashFlow:[],accountBalances:[],recentTransactions:[],spendingByCategory:[],utilityImpact:[],trends:{actualCashFlow:[],utilityImpact:[]}};
const open=()=>render(<MemoryRouter><DashboardPage/></MemoryRouter>);
beforeEach(()=>{
  useDashboard.mockReturnValue({data,isPending:false,isError:false});
  useTransactions.mockReturnValue({data:{data:[{occurredAt:'2023-04-01T12:00:00Z'}]},isSuccess:true,isError:false});
});
afterEach(()=>{cleanup();localStorage.clear();useDashboard.mockReset();useTransactions.mockReset();});

it('calculates adjacent rolling windows, including calendar-aware years',()=>{
  expect(dashboardWindow('day',0,'2026-09-29')).toEqual({from:'2026-09-29',to:'2026-09-29'});
  expect(dashboardWindow('day',1,'2026-09-29')).toEqual({from:'2026-09-28',to:'2026-09-28'});
  expect(dashboardWindow('week',0,'2026-09-29')).toEqual({from:'2026-09-23',to:'2026-09-29'});
  expect(dashboardWindow('week',1,'2026-09-29')).toEqual({from:'2026-09-16',to:'2026-09-22'});
  expect(dashboardWindow('month',0,'2026-09-29')).toEqual({from:'2026-08-31',to:'2026-09-29'});
  expect(dashboardWindow('month',1,'2026-09-29')).toEqual({from:'2026-08-01',to:'2026-08-30'});
  expect(dashboardWindow('month',2,'2026-09-29')).toEqual({from:'2026-07-02',to:'2026-07-31'});
  expect(dashboardWindow('year',0,'2026-09-29')).toEqual({from:'2025-09-30',to:'2026-09-29'});
  expect(dashboardWindow('year',1,'2026-09-29')).toEqual({from:'2024-09-30',to:'2025-09-29'});
});

it('uses segmented periods, refetches on navigation, and restores the period type',()=>{
  const today=todayInTimezone('UTC');
  const first=open();
  expect(screen.queryByRole('combobox',{name:'Period'})).toBeNull();
  expect(screen.queryByRole('combobox',{name:/View currency/})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Last week'}));
  expect(useDashboard).toHaveBeenLastCalledWith('custom',undefined,...Object.values(dashboardWindow('week',0,today)),true);
  expect(localStorage.getItem('spendime.dashboard.period')).toBe('week');
  expect(screen.getByRole('button',{name:'Next period'}).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'Previous period'}));
  expect(useDashboard).toHaveBeenLastCalledWith('custom',undefined,...Object.values(dashboardWindow('week',1,today)),true);
  first.unmount();
  open();
  expect(screen.getByRole('button',{name:'Last week'}).getAttribute('aria-pressed')).toBe('true');
  expect(useDashboard).toHaveBeenLastCalledWith('custom',undefined,...Object.values(dashboardWindow('week',0,today)),true);
});

it('uses the earliest transaction for Total and omits prior-period comparisons',()=>{
  open();
  fireEvent.click(screen.getByRole('button',{name:'Total'}));
  expect(useDashboard).toHaveBeenLastCalledWith('custom',undefined,'2023-04-01',todayInTimezone('UTC'),true);
  expect(screen.queryByRole('button',{name:'Previous period'})).toBeNull();
  expect(screen.queryByText(/Compared with/)).toBeNull();
});
