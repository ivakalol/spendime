// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { keys } from '../../src/client/api/queries';
import { AppShell } from '../../src/client/components/AppShell';
afterEach(()=>{cleanup();vi.restoreAllMocks()});
it('revokes logout and clears authenticated client state',async()=>{const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});client.setQueryData(keys.me,{id:'u',email:'u@example.com',displayName:'User',baseCurrency:'EUR',timezone:'Europe/Sofia',emailVerifiedAt:null,createdAt:''});client.setQueryData([...keys.accounts,false],[]);client.setQueryData([...keys.categories,false],[]);client.setQueryData([...keys.assets,false],[]);client.setQueryData([...keys.liabilities,false],[]);const fetchMock=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({data:{loggedOut:true}}),{status:200,headers:{'Content-Type':'application/json'}}));render(<QueryClientProvider client={client}><MemoryRouter><Routes><Route path="/" element={<AppShell/>}/><Route path="/login" element={<div>Signed out</div>}/></Routes></MemoryRouter></QueryClientProvider>);await userEvent.click(screen.getAllByRole('button',{name:'Sign out'})[0]!);expect(await screen.findByText('Signed out')).toBeInTheDocument();expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout',expect.objectContaining({method:'POST',credentials:'include'}));expect(client.getQueryData(keys.me)).toBeNull()});
