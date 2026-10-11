import express from 'express';
import type pg from 'pg';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../src/server/errors.js';
import { createTransactionsRouter } from '../src/server/domains/transactions/routes.js';

const mocks = vi.hoisted(() => ({ get: vi.fn(), edit: vi.fn(), createRule: vi.fn(), query: vi.fn(), release: vi.fn() }));
vi.mock('../src/server/middleware/authenticate.js', () => ({ requireAuthentication: () => (req: any, _res: any, next: () => void) => {
  req.auth = { user: { id: 'user' } }; next();
} }));
vi.mock('../src/server/domains/transactions/repository.js', () => ({ getTransaction: mocks.get, listTransactions: vi.fn(), voidTransaction: vi.fn() }));
vi.mock('../src/server/domains/transactions/service.js', () => ({ editTransaction: mocks.edit, createTransaction: vi.fn() }));
vi.mock('../src/server/domains/recurring/repository.js', () => ({ createRule: mocks.createRule, getRule: vi.fn(), listRules: vi.fn(), updateRule: vi.fn(), disableRule: vi.fn() }));

const id = '00000000-0000-4000-8000-000000000001';
const ruleId = '00000000-0000-4000-8000-000000000002';
const accountId = '00000000-0000-4000-8000-000000000003';
const current = { id, kind: 'expense', method: 'standard', sourceAccountId: accountId, destinationAccountId: null, categoryId: null, assetId: null, liabilityId: null, recurringRuleId: null, amount: '20.2000', currency: 'EUR', occurredAt: '2026-01-31T12:00:00Z', description: 'ChatGPT', merchant: null, amortizationStart: null, amortizationEnd: null, voidedAt: null };
const schedule = { name: 'ChatGPT', intervalCount: 1, intervalUnit: 'month', startsOn: '2026-01-31', nextDueOn: '2026-02-28' };
const client = { query: mocks.query, release: mocks.release };
const pool = { connect: async () => client } as unknown as pg.Pool;
const app = express(); app.use(express.json()); app.use('/transactions', createTransactionsRouter(pool)); app.use(errorHandler);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.get.mockResolvedValue(current);
  mocks.createRule.mockResolvedValue({ id: ruleId });
  mocks.edit.mockImplementation(async (_client, _id, input) => ({ id, ...input }));
  mocks.query.mockImplementation(async (sql: string) => sql.startsWith('SELECT id,currency')
    ? { rowCount: 1, rows: [{ id: accountId, currency: 'EUR', is_archived: false }] } : { rowCount: 0, rows: [] });
});
describe('transaction conversion API', () => {
  it('creates and links a schedule inside the transaction update', async () => {
    const response = await request(app).patch(`/transactions/${id}`).send({ method: 'recurring', paymentSchedule: schedule }).expect(200);
    expect(response.body.data).toMatchObject({ method: 'recurring', recurringRuleId: ruleId, amount: '20.2000', sourceAccountId: accountId });
    expect(mocks.createRule).toHaveBeenCalledWith(client, 'user', expect.objectContaining({ ...schedule, amount: '20.2000', sourceAccountId: accountId }));
    expect(mocks.query).toHaveBeenCalledWith('COMMIT');
    expect(mocks.createRule).toHaveBeenCalledTimes(1);
  });
  it('rolls back an inserted schedule if the transaction cannot be converted', async () => {
    await request(app).patch(`/transactions/${id}`).send({ method: 'recurring', amortizationStart: '2026-01-31', paymentSchedule: schedule }).expect(400);
    expect(mocks.createRule).toHaveBeenCalledTimes(1);
    expect(mocks.edit).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mocks.query).not.toHaveBeenCalledWith('COMMIT');
  });
  it.each([{ ...current, recurringRuleId: ruleId, method: 'recurring' }, { ...current, voidedAt: '2026-02-01T00:00:00Z' }])('rejects duplicate or voided conversions', async value => {
    mocks.get.mockResolvedValue(value);
    await request(app).patch(`/transactions/${id}`).send({ method: 'recurring', paymentSchedule: schedule }).expect(409);
    expect(mocks.createRule).not.toHaveBeenCalled();
  });
  it('rejects a next payment on the same date', async () => {
    await request(app).patch(`/transactions/${id}`).send({ method: 'recurring', paymentSchedule: { ...schedule, nextDueOn: schedule.startsOn } }).expect(400);
    expect(mocks.createRule).not.toHaveBeenCalled();
  });
  it('keeps existing spread-cost editing working without a schedule', async () => {
    await request(app).patch(`/transactions/${id}`).send({ method: 'amortized', amortizationStart: '2026-01-31', amortizationEnd: '2026-02-09' }).expect(200);
    expect(mocks.edit).toHaveBeenCalledWith(client, id, expect.objectContaining({ method: 'amortized', recurringRuleId: null }));
    expect(mocks.createRule).not.toHaveBeenCalled();
  });
});
