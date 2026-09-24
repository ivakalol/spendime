// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Asset, Transaction } from '../../src/client/api/types';
import { AssetCard } from '../../src/client/pages/AssetsPage';
import { TransactionRow } from '../../src/client/pages/TransactionsPage';
import { EmptyState } from '../../src/client/components/ui';
const baseTx:Transaction={id:'t',kind:'transfer',method:'standard',sourceAccountId:'a',destinationAccountId:'b',categoryId:null,assetId:null,liabilityId:null,recurringRuleId:null,amount:'500.0000',currency:'EUR',occurredAt:'2025-01-01T00:00:00Z',description:null,merchant:null,amortizationStart:null,amortizationEnd:null,dailyImpact:null,voidedAt:null,voidReason:null,createdAt:'',updatedAt:''};
afterEach(cleanup);
describe('financial display semantics',()=>{
  it('labels transfers and shows directional accounts without expense language',()=>{render(<TransactionRow item={baseTx} timezone="Europe/Sofia" accounts={[{id:'a',name:'DSK'},{id:'b',name:'Revolut'}]} categories={[]} onVoid={vi.fn()}/>);expect(screen.getByText('Transfer')).toBeInTheDocument();expect(screen.getByText(/DSK → Revolut/)).toBeInTheDocument();expect(screen.getByText(/↔/)).toBeInTheDocument()});
  it('shows the bank calendar date and uncategorized state across timezones',()=>{render(<TransactionRow item={{...baseTx,kind:'expense',destinationAccountId:null,bankOccurredOn:'2026-09-20',occurredAt:'2026-09-20T12:00:00.000Z'}} timezone="Pacific/Kiritimati" accounts={[{id:'a',name:'Bank'}]} categories={[]} onVoid={vi.fn()}/>);expect(screen.getByText('Uncategorized')).toBeInTheDocument();expect(screen.getByText(/Bank · 2026-09-20/)).toBeInTheDocument()});
  it('renders gain with symbol, label context, and exact rounded display',()=>{const asset:Asset={id:'a',name:'VWCE',classification:'appreciating',currency:'EUR',acquisitionDate:'2025-01-01',cumulativePrincipal:'2200.0000',currentValue:'2340.0000',absoluteReturn:'140.0000',percentageReturn:'6.363636',depreciation:'none',usefulLifeDays:null,residualValue:null,notes:null,isArchived:false,createdAt:'',updatedAt:''};render(<AssetCard asset={asset}/>);expect(screen.getByText(/▲/)).toHaveTextContent('€140.00');expect(screen.getByText(/\+6.36%/)).toBeInTheDocument();expect(screen.getByText(/Contributed €2,200.00/)).toBeInTheDocument()});
  it('renders an intentional empty state',()=>{render(<EmptyState icon={<span>+</span>} title="No accounts yet" description="Create one."/>);expect(screen.getByText('No accounts yet')).toBeInTheDocument()});
});
