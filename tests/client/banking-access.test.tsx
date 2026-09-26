// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from '../../src/client/components/AppShell';
import { BankingRoute } from '../../src/client/auth/BankingRoute';
import { LanguageProvider } from '../../src/client/i18n';

const state=vi.hoisted(()=>({bankingAccess:false,bankingEnabled:false}));
vi.mock('../../src/client/api/queries',async(importOriginal)=>({
  ...await importOriginal<typeof import('../../src/client/api/queries')>(),
  useMe:()=>({isPending:false,data:{displayName:'Test User',email:'test@example.test',...state}}),
}));
afterEach(cleanup);

function wrap(content:React.ReactNode, initial='/') {
  return render(<QueryClientProvider client={new QueryClient()}><LanguageProvider>
    <MemoryRouter initialEntries={[initial]}>{content}</MemoryRouter>
  </LanguageProvider></QueryClientProvider>);
}

describe('owner-only banking navigation',()=>{
  it('hides Banking from ordinary users in desktop and mobile navigation',()=>{
    state.bankingAccess=false;state.bankingEnabled=false;
    wrap(<AppShell/>);
    expect(screen.queryByRole('link',{name:'Banking'})).not.toBeInTheDocument();
  });
  it('redirects a direct banking route for an ordinary user',async()=>{
    state.bankingAccess=false;state.bankingEnabled=false;
    wrap(<Routes><Route path="/banking" element={<BankingRoute><div>Secret banking page</div></BankingRoute>}/>
      <Route path="/" element={<div>Dashboard</div>}/></Routes>,'/banking');
    await waitFor(()=>expect(screen.getByText('Dashboard')).toBeInTheDocument());
    expect(screen.queryByText('Secret banking page')).not.toBeInTheDocument();
  });
  it('shows Banking to the owner but no connection controls when production is disabled',()=>{
    state.bankingAccess=true;state.bankingEnabled=false;
    wrap(<Routes><Route path="/banking" element={<BankingRoute><div>Connect a bank</div></BankingRoute>}/></Routes>,'/banking');
    expect(screen.getByText(/Bank connections have not been activated/)).toBeInTheDocument();
    expect(screen.queryByText('Connect a bank')).not.toBeInTheDocument();
  });
  it('shows the owner banking route when enabled',()=>{
    state.bankingAccess=true;state.bankingEnabled=true;
    wrap(<Routes><Route path="/banking" element={<BankingRoute><div>Connect a bank</div></BankingRoute>}/></Routes>,'/banking');
    expect(screen.getByText('Connect a bank')).toBeInTheDocument();
  });
});
