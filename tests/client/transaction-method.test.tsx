// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Account, Transaction } from '../../src/client/api/types';
import { TransactionDialog } from '../../src/client/pages/TransactionsPage';

const account: Account = { id: 'a', name: 'Revolut', kind: 'checking', currency: 'EUR', openingBalance: '0', currentBalance: '100', institution: null, color: null, icon: null, isArchived: false, createdAt: '', updatedAt: '' };
const transaction: Transaction = { id: 't', kind: 'expense', method: 'standard', sourceAccountId: 'a', destinationAccountId: null, categoryId: null, assetId: null, liabilityId: null, recurringRuleId: null, amount: '20.0000', currency: 'EUR', occurredAt: '2026-01-31T12:00:00Z', bankOccurredOn: '2026-01-31', bankSynced: true, description: 'ChatGPT subscription', merchant: 'OpenAI', amortizationStart: null, amortizationEnd: null, dailyImpact: null, voidedAt: null, voidReason: null, createdAt: '', updatedAt: '' };
function setup(overrides: Partial<Transaction> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: transaction }), { status: 200 }));
  render(<QueryClientProvider client={client}><TransactionDialog transaction={{ ...transaction, ...overrides }} accounts={[account, { ...account, id: 'cash', name: 'Cash', kind: 'cash' }, { ...account, id: 'usd', name: 'USD account', currency: 'USD' }]} categories={[]} timezone="Europe/Sofia" onClose={vi.fn()} /></QueryClientProvider>);
  return fetchMock;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function save(fetchMock: ReturnType<typeof setup>) {
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(fetchMock.mock.calls).toHaveLength(1);
  expect(fetchMock.mock.calls[0][1]?.method).toBe('PATCH');
  return JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
}
describe('editing expense treatment', () => {
  it('turns a bank withdrawal into a transfer to cash', async () => {
    const fetchMock = setup({ categoryId: 'food', description: 'Cash withdrawal' });
    await userEvent.selectOptions(screen.getByLabelText('Expense type'), 'transfer');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.queryByLabelText(/^Category/)).not.toBeInTheDocument();
    const destination = screen.getByLabelText(/^To account/);
    expect(destination).not.toHaveTextContent('Revolut');
    expect(destination).not.toHaveTextContent('USD account');
    await userEvent.selectOptions(destination, 'cash');
    expect(await save(fetchMock)).toMatchObject({ kind: 'transfer', method: 'standard', amount: '20.00', sourceAccountId: 'a', destinationAccountId: 'cash', categoryId: null, recurringRuleId: null, amortizationStart: null, amortizationEnd: null });
  });
  it('clears spread dates and schedule links when switching to transfer', async () => {
    const fetchMock = setup({ method: 'amortized', amortizationStart: '2026-01-31', amortizationEnd: '2026-03-01' });
    await userEvent.selectOptions(screen.getByLabelText('Expense type'), 'transfer');
    expect(screen.queryByLabelText('Use starts')).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(/^To account/), 'cash');
    const body = await save(fetchMock);
    expect(body.amortizationStart).toBeNull();
    expect(body.amortizationEnd).toBeNull();
    expect(body.paymentSchedule).toBeUndefined();
  });
  it('lets the user switch back to expense before saving', async () => {
    const fetchMock = setup();
    await userEvent.selectOptions(screen.getByLabelText('Expense type'), 'transfer');
    await userEvent.selectOptions(screen.getByLabelText('Expense type'), 'standard');
    expect(screen.queryByLabelText(/^To account/)).not.toBeInTheDocument();
    expect(await save(fetchMock)).toMatchObject({ kind: 'expense', destinationAccountId: null });
  });
  it('converts a bank expense to spread cost while keeping its amount and account', async () => {
    const fetchMock = setup();
    await userEvent.selectOptions(screen.getByLabelText('Expense type'), 'amortized');
    expect(screen.getByLabelText('Use starts')).toHaveValue('2026-01-31');
    const body = await save(fetchMock);
    expect(body).toMatchObject({ kind: 'expense', method: 'amortized', amount: '20.00', sourceAccountId: 'a', recurringRuleId: null, amortizationStart: '2026-01-31', amortizationEnd: '2026-03-01' });
    expect(body.paymentSchedule).toBeUndefined();
  });
  it('creates a monthly regular payment and links the existing charge in one request', async () => {
    const fetchMock = setup();
    await userEvent.selectOptions(screen.getByLabelText('Expense type'), 'recurring');
    expect(screen.getByLabelText(/^Next payment/)).toHaveValue('2026-02-28');
    const body = await save(fetchMock);
    expect(body).toMatchObject({ method: 'recurring', amount: '20.00', sourceAccountId: 'a', amortizationStart: null, amortizationEnd: null, paymentSchedule: { name: 'ChatGPT subscription', intervalCount: 1, intervalUnit: 'month', startsOn: '2026-01-31', nextDueOn: '2026-02-28' } });
  });
  it('clears spread dates when returning to ordinary expense', async () => {
    const fetchMock = setup({ method: 'amortized', amortizationStart: '2026-01-31', amortizationEnd: '2026-03-01' });
    await userEvent.selectOptions(screen.getByLabelText('Expense type'), 'standard');
    expect(screen.queryByLabelText('Use starts')).not.toBeInTheDocument();
    expect(await save(fetchMock)).toMatchObject({ method: 'standard', amortizationStart: null, amortizationEnd: null });
  });
  it('does not create another schedule when editing an already linked payment', async () => {
    const fetchMock = setup({ method: 'recurring', recurringRuleId: 'r' });
    expect(screen.queryByLabelText('Payment name')).not.toBeInTheDocument();
    const body = await save(fetchMock);
    expect(body.recurringRuleId).toBe('r');
    expect(body.paymentSchedule).toBeUndefined();
  });
  it('blocks reversed spread dates and a next payment before the recorded charge', async () => {
    setup();
    await userEvent.selectOptions(screen.getByLabelText('Expense type'), 'amortized');
    await userEvent.clear(screen.getByLabelText(/^Use ends/));
    await userEvent.type(screen.getByLabelText(/^Use ends/), '2026-01-01');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('Expense type'), 'recurring');
    await userEvent.clear(screen.getByLabelText(/^Next payment/));
    await userEvent.type(screen.getByLabelText(/^Next payment/), '2026-01-31');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });
  it('shows a save failure and preserves the conversion for retry', async () => {
    const fetchMock = setup();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Could not save payment' } }), { status: 409 }));
    await userEvent.selectOptions(screen.getByLabelText('Expense type'), 'recurring');
    await save(fetchMock);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save payment');
    expect(screen.getByLabelText('Expense type')).toHaveValue('recurring');
  });
});
