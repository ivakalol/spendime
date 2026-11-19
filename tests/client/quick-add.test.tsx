// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { keys } from '../../src/client/api/queries';
import type { Transaction } from '../../src/client/api/types';
import { QuickAdd } from '../../src/client/features/QuickAdd';
const dinner={id:'happy',kind:'expense',sourceAccountId:'a',categoryId:'food',description:'Happy',amount:'100',netExpenseAmount:'100',currency:'EUR',occurredAt:'2026-11-19T12:00:00Z'} as Transaction;
const account={id:'a',name:'Cash',kind:'cash',currency:'EUR',openingBalance:'0',currentBalance:'100',institution:null,color:null,icon:null,isArchived:false,createdAt:'',updatedAt:''};
function setup(reimbursing?: Transaction){const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity},mutations:{retry:false}}});client.setQueryData(keys.me,{id:'u',email:'u@example.com',displayName:'User',baseCurrency:'EUR',timezone:'Europe/Sofia',emailVerifiedAt:null,createdAt:''});client.setQueryData([...keys.accounts,false],[account,{...account,id:'b',name:'Savings'}]);client.setQueryData([...keys.categories,false],[{id:'food',name:'Food',kind:'expense',isArchived:false},{id:'salary',name:'Salary',kind:'income',isArchived:false}]);client.setQueryData([...keys.assets,false],[]);client.setQueryData([...keys.liabilities,false],[]);client.setQueryData([...keys.transactions,new URLSearchParams({kind:'expense',search:'',limit:'25',offset:'0',sort:'occurredAt',direction:'desc'}).toString()],{data:[dinner],meta:{total:1}});render(<QueryClientProvider client={client}><MemoryRouter><QuickAdd open reimbursing={reimbursing} onClose={vi.fn()}/></MemoryRouter></QueryClientProvider>);return client}
afterEach(()=>{cleanup();vi.restoreAllMocks()});
describe('quick entry',()=>{
  it('prefills the category and account when opened from a shared expense',()=>{
    setup({...dinner,description:'Dinner with friends'});
    expect(screen.getByRole('radio',{name:'Paid back'})).toHaveAttribute('aria-checked','true');
    expect(screen.getByLabelText('Receive into')).toHaveValue('a');
    expect(screen.getByLabelText('Money back for')).toHaveValue('happy');
    expect(screen.queryByLabelText('Category')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Note')).toHaveValue('Dinner with friends');
    expect(screen.getByLabelText('Amount')).toHaveValue('');
  });
  it('records money paid back as reduced spending with an expense category',async()=>{
    setup();
    const fetchMock=vi.spyOn(globalThis,'fetch').mockImplementation((_url,init)=>Promise.resolve(new Response(JSON.stringify({data:init?.method==='POST'?{id:'paid-back'}:String(_url).includes('?')?[dinner]:dinner,meta:{total:1}}),{status:init?.method==='POST'?201:200,headers:{'Content-Type':'application/json'}})));
    await userEvent.click(screen.getByRole('radio',{name:'Paid back'}));
    expect(screen.getByText(/Your spending is €20/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Pay from')).not.toBeInTheDocument();
    expect(screen.queryByRole('option',{name:'Salary'})).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Amount'),'80');
    await userEvent.selectOptions(screen.getByLabelText('Receive into'),'b');
    await userEvent.selectOptions(screen.getByLabelText('Money back for'),'happy');
    expect(screen.getByText(/Your share after this repayment/)).toHaveTextContent('€20.00');
    fireEvent.change(screen.getByLabelText('Amount'),{target:{value:'101'}});
    expect(screen.getByRole('button',{name:'Save entry'})).toBeDisabled();
    expect(screen.getByText('Money paid back exceeds the remaining expense.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Amount'),{target:{value:'80'}});
    await userEvent.click(screen.getByRole('button',{name:'Save entry'}));
    await waitFor(()=>expect(fetchMock.mock.calls.some(([,init])=>init?.method==='POST')).toBe(true));
    const post=fetchMock.mock.calls.find(([,init])=>init?.method==='POST');
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({kind:'reimbursement',amount:'80',sourceAccountId:null,destinationAccountId:'b',categoryId:'food',method:'standard',originalTransactionId:'happy'});
  });
  it('shows transaction-specific amortization and transfer controls',async()=>{setup();await userEvent.click(screen.getByRole('radio',{name:'Spread cost'}));expect(screen.getByLabelText(/^Expected use/)).toBeInTheDocument();expect(screen.getByText(/balance and spending include the full price today/i)).toBeInTheDocument();await userEvent.click(screen.getByRole('radio',{name:'Transfer'}));expect(screen.getByLabelText('From account')).toBeInTheDocument();expect(screen.getByLabelText(/^To account/)).toBeInTheDocument();await userEvent.selectOptions(screen.getByLabelText('From account'),'a');await userEvent.selectOptions(screen.getByLabelText(/^To account/),'a');expect(screen.getByText('Choose different accounts with the same currency.')).toBeInTheDocument();expect(screen.getByRole('button',{name:'Save entry'})).toBeDisabled()});
  it('submits an exact string expense and invalidates affected server state',async()=>{const client=setup();const invalidate=vi.spyOn(client,'invalidateQueries');const fetchMock=vi.spyOn(globalThis,'fetch').mockImplementation((_url,init)=>Promise.resolve(new Response(JSON.stringify({data:init?.method==='POST'?{id:'t'}:[]}),{status:init?.method==='POST'?201:200,headers:{'Content-Type':'application/json'}})));await userEvent.type(screen.getByLabelText(/^Amount/),'29.99');fireEvent.change(screen.getByLabelText(/^Date & time/),{target:{value:'2026-10-18T12:30'}});await userEvent.selectOptions(screen.getByLabelText('Pay from'),'a');await userEvent.click(screen.getByRole('button',{name:'Save entry'}));await waitFor(()=>expect(fetchMock).toHaveBeenCalled());const post=fetchMock.mock.calls.find(([,init])=>init?.method==='POST');const body=JSON.parse(String(post?.[1]?.body));expect(body.amount).toBe('29.99');expect(body.kind).toBe('expense');expect(body.occurredAt).toBe('2026-10-18T09:30:00.000Z');expect(invalidate).toHaveBeenCalled()});
  it('supports roving radio focus, arrow keys, and Home/End without tabbing through every type',async()=>{
    setup();
    const expense=screen.getByRole('radio',{name:'Expense'});
    expense.focus();
    await userEvent.keyboard('{End}');
    const debt=screen.getByRole('radio',{name:'Debt payment'});
    expect(debt).toHaveFocus();expect(debt).toHaveAttribute('aria-checked','true');
    expect(screen.getByLabelText('Liability')).toBeInTheDocument();
    await userEvent.keyboard('{ArrowRight}');
    expect(expense).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio',{name:'Income'})).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByLabelText('Amount')).toHaveFocus();
    expect(screen.getAllByRole('radio').filter(item=>item.tabIndex===0)).toHaveLength(1);
  });
  it('submits income to the selected account with an income category',async()=>{
    setup();
    const fetchMock=vi.spyOn(globalThis,'fetch').mockImplementation((_url,init)=>Promise.resolve(new Response(JSON.stringify({data:init?.method==='POST'?{id:'income'}:[]}),{status:init?.method==='POST'?201:200,headers:{'Content-Type':'application/json'}})));
    await userEvent.click(screen.getByRole('radio',{name:'Income'}));
    await userEvent.type(screen.getByLabelText('Amount'),'1500.25');
    await userEvent.selectOptions(screen.getByLabelText('Receive into'),'b');
    await userEvent.selectOptions(screen.getByLabelText('Category'),'salary');
    await userEvent.click(screen.getByRole('button',{name:'Save entry'}));
    await waitFor(()=>expect(fetchMock.mock.calls.some(([,init])=>init?.method==='POST')).toBe(true));
    const post=fetchMock.mock.calls.find(([,init])=>init?.method==='POST');
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({kind:'income',amount:'1500.25',sourceAccountId:null,destinationAccountId:'b',categoryId:'salary'});
  });
  it('clears an incompatible category when switching from expense to income',async()=>{
    setup();
    await userEvent.selectOptions(screen.getByLabelText('Category'),'food');
    await userEvent.click(screen.getByRole('radio',{name:'Income'}));
    expect(screen.getByLabelText('Category')).toHaveValue('');
    expect(screen.getByRole('option',{name:'Salary'})).toBeInTheDocument();
  });
  it('reacts to offline and online events while the sheet is open',async()=>{
    const connection=vi.spyOn(navigator,'onLine','get').mockReturnValue(true);
    setup();
    connection.mockReturnValue(false);
    fireEvent(window,new Event('offline'));
    await waitFor(()=>expect(screen.getByRole('button',{name:'Offline'})).toBeDisabled());
    connection.mockReturnValue(true);
    fireEvent(window,new Event('online'));
    await waitFor(()=>expect(screen.getByRole('button',{name:'Save entry'})).toBeEnabled());
  });
  it('reveals the income destination workflow',async()=>{setup();await userEvent.click(screen.getByRole('radio',{name:'Income'}));expect(screen.getByLabelText('Receive into')).toBeInTheDocument();expect(screen.queryByLabelText('Pay from')).not.toBeInTheDocument()});
});
