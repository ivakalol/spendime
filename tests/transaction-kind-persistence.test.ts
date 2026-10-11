import type pg from 'pg';
import { expect, it, vi } from 'vitest';
import { updateTransaction } from '../src/server/domains/transactions/repository.js';
it('persists the transfer kind with the account references in the same UPDATE', async () => {
  const query = vi.fn().mockResolvedValueOnce({ rows: [{ id: 't' }] }).mockResolvedValueOnce({ rows: [{ id: 't', kind: 'transfer' }] });
  const result = await updateTransaction({ query } as unknown as pg.PoolClient, 't', { kind: 'transfer', method: 'standard', sourceAccountId: 'bank', destinationAccountId: 'cash', categoryId: null, assetId: null, liabilityId: null, recurringRuleId: null, amount: '200.20', currency: 'EUR', occurredAt: '2026-10-08T12:00:00Z', description: 'Withdrawal', merchant: null, amortizationStart: null, amortizationEnd: null });
  expect(query.mock.calls[0]![0]).toContain('kind = $16');
  expect(query.mock.calls[0]![1][15]).toBe('transfer');
  expect(query.mock.calls[0]![1].slice(2, 4)).toEqual(['bank', 'cash']);
  expect(result.kind).toBe('transfer');
});
