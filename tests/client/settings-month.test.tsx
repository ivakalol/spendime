// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SettingsPage from '../../src/client/pages/SettingsPage';

const { me, save } = vi.hoisted(() => ({
  me: {data:{baseCurrency:'EUR',timezone:'UTC',customMonthEnabled:false,monthStartDay:1,displayName:'User',email:'test@example.com'}},
  save: {mutate:vi.fn(),reset:vi.fn(),isPending:false,isSuccess:false,error:null},
}));
vi.mock('../../src/client/api/queries', () => ({useMe:()=>me,useSavePreferences:()=>save}));
vi.mock('../../src/client/utils/dateTime', () => ({
  browserTimezone:()=>'UTC',
  todayInTimezone:(zone:string)=>{if(zone==='Invalid')throw new RangeError();return '2026-10-08';},
}));
const open = () => render(<MemoryRouter><SettingsPage /></MemoryRouter>);
beforeEach(()=>{me.data.customMonthEnabled=false;me.data.monthStartDay=1;save.isPending=false;save.mutate.mockReset();});
afterEach(cleanup);

it('keeps the existing Month view by default and previews the chosen payday before saving',()=>{
  open();
  expect(screen.getByRole('switch',{name:'Custom month start'})).toHaveAttribute('aria-checked','false');
  expect(screen.getByRole('button',{name:'Save preferences'})).toBeDisabled();
  fireEvent.click(screen.getByRole('switch'));
  fireEvent.change(screen.getByRole('combobox',{name:/Start each month on/}),{target:{value:'5'}});
  expect(screen.getByText('Oct 5, 2026 – Nov 4, 2026')).toBeInTheDocument();
  expect(save.mutate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Save preferences'}));
  expect(save.mutate).toHaveBeenCalledWith({baseCurrency:'EUR',timezone:'UTC',customMonthEnabled:true,monthStartDay:5});
});

it('restores a saved start day and keeps that choice when the cycle is switched off',()=>{
  me.data.customMonthEnabled=true;me.data.monthStartDay=31;
  open();
  expect(screen.getByRole('combobox',{name:/Start each month on/})).toHaveValue('31');
  fireEvent.click(screen.getByRole('switch'));
  expect(screen.queryByText('Current cycle preview')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Save preferences'}));
  expect(save.mutate).toHaveBeenCalledWith(expect.objectContaining({customMonthEnabled:false,monthStartDay:31}));
});

it('does not crash the preview while an incomplete timezone is being typed',()=>{
  open();fireEvent.click(screen.getByRole('switch'));
  fireEvent.change(screen.getByRole('combobox',{name:/Timezone/}),{target:{value:'Invalid'}});
  expect(screen.getByText('Current cycle preview')).toBeInTheDocument();
});
