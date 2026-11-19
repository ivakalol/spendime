import type pg from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TransactionWrite } from '../src/server/domains/transactions/model.js';
import { editTransaction } from '../src/server/domains/transactions/service.js';
const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
vi.mock('../src/server/domains/transactions/repository.js', () => ({ getTransaction: mocks.get, updateTransaction: mocks.update, insertTransaction: vi.fn() }));
const expense = { kind: 'expense', method: 'standard', sourceAccountId: 'bank', destinationAccountId: null, categoryId: null, assetId: null, liabilityId: null, recurringRuleId: null, amount: '200.20', currency: 'EUR', occurredAt: '2026-10-08T12:00:00Z', description: 'Withdrawal', merchant: null, amortizationStart: null, amortizationEnd: null } satisfies TransactionWrite;
const transfer: TransactionWrite = { ...expense, kind: 'transfer', destinationAccountId: 'cash' };
let query: ReturnType<typeof vi.fn>;
let client: pg.PoolClient;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.get.mockResolvedValue({ ...expense, id: 't', bankSynced: true, voidedAt: null });
  mocks.update.mockResolvedValue({ id: 't' });
  query = vi.fn(async (sql: string) => sql.includes('FROM accounts') ? { rowCount: 2, rows: [{ id: 'bank', currency: 'EUR', is_archived: false }, { id: 'cash', currency: 'EUR', is_archived: false }] } : { rows: [] });
  client = { query } as unknown as pg.PoolClient;
});
describe('expense to transfer conversion', () => {
  it.each(['income', 'reimbursement'] as const)('allows reclassification from %s to the other receipt type', async kind => {
    const receipt: TransactionWrite = { ...expense, kind, sourceAccountId: null, destinationAccountId: 'bank' };
    mocks.get.mockResolvedValueOnce({ ...receipt, id: 't', bankSynced: true });
    query.mockResolvedValue({ rowCount: 1, rows: [{ id: 'bank', currency: 'EUR', is_archived: false }] });
    const input: TransactionWrite = { ...receipt, kind: kind === 'income' ? 'reimbursement' : 'income' };
    await editTransaction(client, 't', input);
    expect(mocks.update).toHaveBeenCalledWith(client, 't', input);
  });
  it('rejects an income category on money paid back', async () => {
    mocks.get.mockResolvedValueOnce({ ...expense, kind: 'income', sourceAccountId: null, destinationAccountId: 'bank' });
    query.mockImplementation(async (sql: string) => sql.includes('FROM categories') ? { rows: [{ kind: 'income', is_archived: false }] } : { rowCount: 1, rows: [{ id: 'bank', currency: 'EUR', is_archived: false }] });
    await expect(editTransaction(client, 't', { ...expense, kind: 'reimbursement', sourceAccountId: null, destinationAccountId: 'bank', categoryId: 'salary' })).rejects.toMatchObject({ code: 'related_resource_not_found' });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('updates the existing transaction with both account references', async () => {
    await editTransaction(client, 't', transfer);
    expect(mocks.update).toHaveBeenCalledWith(client, 't', transfer);
    expect(transfer.amount).toBe('200.20');
  });
  it('keeps other transaction kind changes protected', async () => {
    await expect(editTransaction(client, 't', { ...expense, kind: 'income' })).rejects.toMatchObject({ code: 'immutable_transaction_kind' });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('rejects expense metadata left on a transfer', async () => {
    await expect(editTransaction(client, 't', { ...transfer, categoryId: 'food' })).rejects.toMatchObject({ code: 'invalid_transfer_conversion' });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('rejects an expense with active linked refunds', async () => {
    query.mockResolvedValue({ rows: [{ exists: 1 }] });
    await expect(editTransaction(client, 't', transfer)).rejects.toMatchObject({ code: 'expense_has_refunds' });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('rejects a missing, foreign or differently denominated destination account', async () => {
    query.mockImplementation(async (sql: string) => sql.includes('FROM accounts') ? { rowCount: 1, rows: [{ id: 'bank', currency: 'EUR', is_archived: false }] } : { rows: [] });
    await expect(editTransaction(client, 't', transfer)).rejects.toMatchObject({ code: 'related_resource_not_found' });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
