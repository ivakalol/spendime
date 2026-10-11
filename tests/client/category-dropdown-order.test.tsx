// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Account, Category, Transaction } from '../../src/client/api/types';
import { keys } from '../../src/client/api/queries';
import { QuickAdd } from '../../src/client/features/QuickAdd';
import { TransactionDialog } from '../../src/client/pages/TransactionsPage';

const categories: Category[] = [
  ['z', 'Travel', 'expense', false],
  ['i', 'Salary', 'income', false],
  ['b', 'Other', 'both', false],
  ['old', 'Archived', 'expense', true],
  ['a', 'Food', 'expense', false],
].map(([id,name,kind,isArchived])=>({id,name,kind,isArchived,color:null,icon:null,isSystem:false,createdAt:'',updatedAt:''} as Category));
const account: Account = {id:'account',name:'Cash',kind:'cash',currency:'EUR',openingBalance:'0',currentBalance:'100',institution:null,color:null,icon:null,isArchived:false,createdAt:'',updatedAt:''};
const transaction: Transaction = {id:'t',kind:'expense',method:'standard',sourceAccountId:account.id,destinationAccountId:null,categoryId:null,assetId:null,liabilityId:null,recurringRuleId:null,amount:'20',currency:'EUR',occurredAt:'2026-10-11T12:00:00Z',description:null,merchant:null,amortizationStart:null,amortizationEnd:null,dailyImpact:null,voidedAt:null,voidReason:null,createdAt:'',updatedAt:''};

afterEach(cleanup);

describe('saved category order in transaction menus',()=>{
  it.each(['new','edit'] as const)('preserves the saved order in the %s expense menu while filtering ineligible categories',mode=>{
    const client=new QueryClient({defaultOptions:{queries:{staleTime:Infinity,retry:false}}});
    client.setQueryData([...keys.accounts,false],[account]);
    client.setQueryData([...keys.categories,false],categories.filter(item=>!item.isArchived));
    client.setQueryData([...keys.assets,false],[]);
    client.setQueryData([...keys.liabilities,false],[]);
    client.setQueryData(keys.me,{baseCurrency:'EUR',timezone:'UTC'});
    render(<QueryClientProvider client={client}>{mode==='new'
      ?<QuickAdd open onClose={()=>{}}/>
      :<TransactionDialog transaction={transaction} accounts={[account]} categories={categories} timezone="UTC" onClose={()=>{}}/>
    }</QueryClientProvider>);
    const options=within(screen.getByLabelText(/^Category/)).getAllByRole('option');
    expect(options.map(option=>option.textContent)).toEqual(['Uncategorized','Travel','Other','Food']);
  });
});
