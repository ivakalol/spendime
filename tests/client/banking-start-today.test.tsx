// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import BankingReconciliationPage from '../../src/client/pages/BankingReconciliationPage';
import { LanguageProvider } from '../../src/client/i18n';

const state=vi.hoisted(()=>({started:false}));
const request=vi.hoisted(()=>vi.fn());
vi.mock('../../src/client/api/client',()=>({apiRequest:request,jsonBody:(value:unknown)=>({body:JSON.stringify(value)})}));
vi.mock('../../src/client/api/queries',()=>({useMe:()=>({data:{bankingEnvironment:'production',timezone:'UTC'}})}));
afterEach(()=>{cleanup();vi.restoreAllMocks();request.mockReset();state.started=false;});

function mount() {
  request.mockImplementation(async(path:string,options?:RequestInit)=>{
    if(options?.method==='POST') {state.started=true;return {data:{ignoredCount:450}};}
    if(path==='/api/banking/connections')return {data:[{id:'connection',accounts:[{
      id:'link',name:'Revolut EUR',linkMode:'existing',lastSyncedAt:'2026-09-27T12:00:00Z',
      automaticPostAfter:state.started?'2026-09-27T12:01:00Z':null,
      historyIgnoredBefore:state.started?'2026-09-27':null,unresolvedReviewCount:state.started?0:450,
    }]}]};
    return {data:[]};
  });
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  render(<QueryClientProvider client={client}><LanguageProvider><MemoryRouter><BankingReconciliationPage/></MemoryRouter></LanguageProvider></QueryClientProvider>);
}

describe('start bank imports from today',()=>{
  it('uses the full backlog count and requires confirmation before ignoring history',async()=>{
    vi.spyOn(window,'confirm').mockReturnValue(false);
    mount();
    const button=await screen.findByRole('button',{name:'Start importing from today'});
    expect(screen.getByText('450 items still need a decision.')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Complete initial review'})).toBeDisabled();
    fireEvent.click(button);
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('manual transactions and balance will stay unchanged'));
    expect(request.mock.calls.filter(([,options])=>options?.method==='POST')).toHaveLength(0);
  });
  it('clears the backlog display and explains the same-day review boundary',async()=>{
    vi.spyOn(window,'confirm').mockReturnValue(true);
    mount();
    fireEvent.click(await screen.findByRole('button',{name:'Start importing from today'}));
    await waitFor(()=>expect(screen.getByText('0 items still need a decision.')).toBeInTheDocument());
    expect(request).toHaveBeenCalledWith('/api/banking/links/link/start-from-today',expect.objectContaining({method:'POST'}));
    expect(screen.getByRole('status')).toHaveTextContent('New items booked today still need review');
    expect(screen.queryByRole('button',{name:'Start importing from today'})).not.toBeInTheDocument();
  });
});
