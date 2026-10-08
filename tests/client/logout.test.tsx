// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { keys } from '../../src/client/api/queries';
import { AppShell } from '../../src/client/components/AppShell';

function open() {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  const client = new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
  client.setQueryData(keys.me, {id:'u',email:'u@example.com',displayName:'User',baseCurrency:'EUR',timezone:'Europe/Sofia',emailVerifiedAt:null,createdAt:''});
  client.setQueryData(keys.accounts, [{id:'a'}]);
  render(<QueryClientProvider client={client}><MemoryRouter><Routes><Route path="/" element={<AppShell/>}/><Route path="/login" element={<div>Signed out</div>}/></Routes></MemoryRouter></QueryClientProvider>);
  return client;
}
const ok = () => new Response(JSON.stringify({data:{loggedOut:true}}), {status:200,headers:{'Content-Type':'application/json'}});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('requires a second action before revoking logout and clearing the financial cache', async () => {
  const fetchMock = vi.spyOn(globalThis,'fetch').mockResolvedValue(ok());
  const client = open();
  await userEvent.click(screen.getByRole('button',{name:'Sign out',exact:true}));
  expect(fetchMock).not.toHaveBeenCalled();
  expect(client.getQueryData(keys.accounts)).toEqual([{id:'a'}]);
  expect(screen.getByRole('dialog',{name:'Sign out of Spendime?'})).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button',{name:'Confirm sign out'}));
  expect(await screen.findByText('Signed out')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout',expect.objectContaining({method:'POST',credentials:'include'}));
  expect(client.getQueryData(keys.me)).toBeNull();
  expect(client.getQueryData(keys.accounts)).toBeUndefined();
});

it('cancels confirmation without changing the session', async () => {
  const fetchMock = vi.spyOn(globalThis,'fetch').mockResolvedValue(ok());
  const client = open();
  await userEvent.click(screen.getByRole('button',{name:'Sign out',exact:true}));
  await userEvent.click(screen.getByRole('button',{name:'Stay signed in'}));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(client.getQueryData(keys.me)).not.toBeNull();
});

it('opens a single confirmation dialog from the mobile More menu', async () => {
  const fetchMock = vi.spyOn(globalThis,'fetch').mockResolvedValue(ok());
  open();
  await userEvent.click(screen.getByRole('button',{name:'More',exact:true}));
  await userEvent.click(within(screen.getByRole('dialog',{name:'More'})).getByRole('button',{name:'Sign out',exact:true}));
  expect(screen.queryByRole('dialog',{name:'More'})).toBeNull();
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(document.body.style.overflow).toBe('hidden');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('keeps the user signed in and offers retry when logout fails', async () => {
  const fetchMock = vi.spyOn(globalThis,'fetch').mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce(ok());
  const client = open();
  await userEvent.click(screen.getByRole('button',{name:'Sign out',exact:true}));
  await userEvent.click(screen.getByRole('button',{name:'Confirm sign out'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('The server could not be reached');
  expect(client.getQueryData(keys.me)).not.toBeNull();
  await userEvent.click(screen.getByRole('button',{name:'Confirm sign out'}));
  expect(await screen.findByText('Signed out')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
