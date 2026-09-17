// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { keys } from '../../src/client/api/queries';
import { QuickAdd } from '../../src/client/features/QuickAdd';
const account={id:'a',name:'Cash',kind:'cash',currency:'EUR',openingBalance:'0',currentBalance:'100',institution:null,color:null,icon:null,isArchived:false,createdAt:'',updatedAt:''};
function setup(){const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});client.setQueryData(keys.me,{id:'u',email:'u@example.com',displayName:'User',baseCurrency:'EUR',timezone:'Europe/Sofia',emailVerifiedAt:null,createdAt:''});client.setQueryData([...keys.accounts,false],[account,{...account,id:'b',name:'Savings'}]);client.setQueryData([...keys.categories,false],[]);client.setQueryData([...keys.assets,false],[]);client.setQueryData([...keys.liabilities,false],[]);render(<QueryClientProvider client={client}><MemoryRouter><QuickAdd open onClose={vi.fn()}/></MemoryRouter></QueryClientProvider>);return client}
afterEach(()=>{cleanup();vi.restoreAllMocks()});
describe('quick entry',()=>{
  it('shows transaction-specific amortization and transfer controls',async()=>{setup();await userEvent.click(screen.getByRole('radio',{name:'Amortized'}));expect(screen.getByLabelText(/^Expected use/)).toBeInTheDocument();expect(screen.getByText(/full price leaves your account today/i)).toBeInTheDocument();await userEvent.click(screen.getByRole('radio',{name:'Transfer'}));expect(screen.getByLabelText('From account')).toBeInTheDocument();expect(screen.getByLabelText(/^To account/)).toBeInTheDocument();await userEvent.selectOptions(screen.getByLabelText('From account'),'a');await userEvent.selectOptions(screen.getByLabelText(/^To account/),'a');expect(screen.getByText('Choose two different accounts.')).toBeInTheDocument();expect(screen.getByRole('button',{name:'Save entry'})).toBeDisabled()});
  it('submits an exact string expense and invalidates affected server state',async()=>{const client=setup();const invalidate=vi.spyOn(client,'invalidateQueries');const fetchMock=vi.spyOn(globalThis,'fetch').mockImplementation((_url,init)=>Promise.resolve(new Response(JSON.stringify({data:init?.method==='POST'?{id:'t'}:[]}),{status:init?.method==='POST'?201:200,headers:{'Content-Type':'application/json'}})));await userEvent.type(screen.getByLabelText(/^Amount/),'29.99');await userEvent.selectOptions(screen.getByLabelText('Pay from'),'a');await userEvent.click(screen.getByRole('button',{name:'Save entry'}));await waitFor(()=>expect(fetchMock).toHaveBeenCalled());const post=fetchMock.mock.calls.find(([,init])=>init?.method==='POST');const body=JSON.parse(String(post?.[1]?.body));expect(body.amount).toBe('29.99');expect(body.kind).toBe('expense');expect(invalidate).toHaveBeenCalled()});
  it('reveals the income destination workflow',async()=>{setup();await userEvent.click(screen.getByRole('radio',{name:'Income'}));expect(screen.getByLabelText('Receive into')).toBeInTheDocument();expect(screen.queryByLabelText('Pay from')).not.toBeInTheDocument()});
});
