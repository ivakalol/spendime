import type { Express } from 'express';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';
import { loadConfig, type AppConfig } from '../src/server/config.js';
import { assertSafeRuntimeRole, createPool } from '../src/server/db/pool.js';
import { withUserTransaction } from '../src/server/db/transactions.js';

describe('financial CRUD and analytics with PostgreSQL RLS', () => {
  let app: Express;
  let pool: pg.Pool;
  let config: AppConfig;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;
  const unique = `${Date.now()}-${crypto.randomUUID()}`;
  const emailA = `finance-a-${unique}@example.test`;
  const emailB = `finance-b-${unique}@example.test`;
  const password = 'Correct-Horse-47!';
  let userA: string;
  let userB: string;
  let bankId: string;
  let cashId: string;
  let foreignAccountId: string;
  let categoryId: string;
  let standardExpenseId: string;
  let appreciatingAssetId: string;
  let liabilityId: string;
  let recurringId: string;

  beforeAll(async () => {
    config = loadConfig({ ...process.env, NODE_ENV: 'test', COOKIE_SECURE: 'never', AUTH_RATE_LIMIT_MAX: '100' });
    pool = createPool(config.databaseUrl, 3);
    await assertSafeRuntimeRole(pool);
    app = createApp(pool, config);
    agentA = request.agent(app);
    agentB = request.agent(app);
    const a = await agentA.post('/api/auth/register').send({ email: emailA, password, displayName: 'Finance A' }).expect(201);
    const b = await agentB.post('/api/auth/register').send({ email: emailB, password, displayName: 'Finance B' }).expect(201);
    userA = a.body.data.user.id;
    userB = b.body.data.user.id;
    await pool.query("UPDATE users SET timezone='Europe/Sofia' WHERE id=$1", [userA]);
  });

  afterAll(async () => {
    if (pool) {
      for (const id of [userA, userB].filter(Boolean)) {
        await withUserTransaction(pool, id, (client) =>
          client.query('DELETE FROM asset_contributions WHERE user_id=$1', [id]));
      }
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[userA, userB].filter(Boolean)]);
      await pool.end();
    }
  });

  it('supports account CRUD, balances, archival, and cross-user isolation', async () => {
    bankId = (await agentA.post('/api/accounts').send({
      name: 'DSK', kind: 'checking', currency: 'EUR', openingBalance: '5000.00',
    }).expect(201)).body.data.id;
    cashId = (await agentA.post('/api/accounts').send({
      name: 'Cash', kind: 'cash', currency: 'EUR', openingBalance: '0.00',
    }).expect(201)).body.data.id;
    foreignAccountId = (await agentB.post('/api/accounts').send({
      name: 'Foreign', kind: 'cash', currency: 'EUR', openingBalance: '100.00',
    }).expect(201)).body.data.id;

    await agentA.patch(`/api/accounts/${bankId}`).send({ institution: 'DSK Bank' }).expect(200)
      .expect(({ body }) => expect(body.data.institution).toBe('DSK Bank'));
    await agentB.get(`/api/accounts/${bankId}`).expect(404);

    const archiveId = (await agentA.post('/api/accounts').send({
      name: 'Old account', kind: 'other', currency: 'EUR', openingBalance: '0',
    }).expect(201)).body.data.id;
    await agentA.delete(`/api/accounts/${archiveId}`).expect(204);
    await agentA.get(`/api/accounts/${archiveId}`).expect(200)
      .expect(({ body }) => expect(body.data.isArchived).toBe(true));
  });

  it('supports default/custom categories and protects system categories', async () => {
    const defaults = await agentA.get('/api/categories').expect(200);
    expect(defaults.body.data.some((category: any) => category.name === 'Food' && category.isSystem)).toBe(true);
    const systemId = defaults.body.data.find((category: any) => category.isSystem).id;
    await agentA.patch(`/api/categories/${systemId}`).send({ name: 'Changed' }).expect(409);

    categoryId = (await agentA.post('/api/categories').send({
      name: 'Learning', kind: 'expense', color: '#123456',
    }).expect(201)).body.data.id;
    await agentA.patch(`/api/categories/${categoryId}`).send({ icon: 'book' }).expect(200);
    await agentB.get(`/api/categories/${categoryId}`).expect(404);

    const archiveId = (await agentA.post('/api/categories').send({ name: 'Temporary', kind: 'both' }).expect(201)).body.data.id;
    await agentA.delete(`/api/categories/${archiveId}`).expect(204);
  });

  it('creates standard, income, amortized, and atomic transfer transactions', async () => {
    const occurredAt = '2026-01-01T22:30:00.000Z'; // Jan 2 in Europe/Sofia.
    standardExpenseId = (await agentA.post('/api/transactions').send({
      kind: 'expense', sourceAccountId: bankId, categoryId, amount: '29.99',
      currency: 'EUR', occurredAt, description: 'Late local expense',
    }).expect(201)).body.data.id;
    await agentA.post('/api/transactions').send({
      kind: 'income', destinationAccountId: bankId, amount: '100.00', currency: 'EUR', occurredAt,
    }).expect(201);
    const amortized = await agentA.post('/api/transactions').send({
      kind: 'expense', method: 'amortized', sourceAccountId: bankId, categoryId,
      amount: '1200.00', currency: 'EUR', occurredAt,
      amortizationStart: '2026-01-02', amortizationEnd: '2027-01-01',
    }).expect(201);
    expect(amortized.body.data.dailyImpact).toBe('3.287671');

    await agentA.post('/api/transactions').send({
      kind: 'expense', method: 'amortized', sourceAccountId: bankId,
      amount: '10.00', currency: 'EUR', occurredAt,
      amortizationStart: '2026-02-02', amortizationEnd: '2026-02-01',
    }).expect(400);
    await agentA.post('/api/transactions').send({
      kind: 'transfer', sourceAccountId: bankId, destinationAccountId: cashId,
      amount: '500.00', currency: 'EUR', occurredAt,
    }).expect(201);
    await agentA.post('/api/transactions').send({
      kind: 'transfer', sourceAccountId: foreignAccountId, destinationAccountId: cashId,
      amount: '1.00', currency: 'EUR', occurredAt,
    }).expect(404);
    await agentA.patch(`/api/transactions/${standardExpenseId}`).send({ description: 'Updated note' }).expect(200);
    await agentB.get(`/api/transactions/${standardExpenseId}`).expect(404);
  });

  it('paginates, filters, and whitelist-sorts transaction history', async () => {
    const response = await agentA.get(
      `/api/transactions?accountId=${bankId}&categoryId=${categoryId}&kind=expense&limit=1&offset=0&sort=amount&direction=asc`,
    ).expect(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.meta).toMatchObject({ limit: 1, offset: 0, total: 2 });
    await agentA.get('/api/transactions?sort=amount;DROP%20TABLE%20users').expect(400);
  });

  it('preserves exact decimal arithmetic without binary floating-point conversion', async () => {
    for (const amount of ['0.10', '0.20']) {
      await agentA.post('/api/transactions').send({
        kind: 'expense', sourceAccountId: bankId, categoryId, amount,
        currency: 'EUR', occurredAt: '2026-01-03T10:00:00.000Z',
      }).expect(201);
    }
    const dashboard = await agentA.get('/api/dashboard?timeframe=daily&anchor=2026-01-03').expect(200);
    expect(dashboard.body.data.cashFlow.find((row: any) => row.currency === 'EUR').actualSpending).toBe('0.3000');
  });

  it('supports appreciating, depreciating, and custom assets with DCA history', async () => {
    appreciatingAssetId = (await agentA.post('/api/assets').send({
      name: 'VWCE', classification: 'appreciating', currency: 'EUR',
      acquisitionDate: '2025-01-01', initialContribution: '2000.00', currentValue: '2000.00',
    }).expect(201)).body.data.id;
    await agentA.post(`/api/assets/${appreciatingAssetId}/contributions`).send({
      amount: '100.00', currency: 'EUR', contributedAt: '2026-01-02T10:00:00.000Z',
      sourceAccountId: bankId, currentValue: '2200.00', note: 'DCA 2',
    }).expect(201);
    const final = await agentA.post(`/api/assets/${appreciatingAssetId}/contributions`).send({
      amount: '100.00', currency: 'EUR', contributedAt: '2026-01-02T11:00:00.000Z',
      currentValue: '2340.00', note: 'DCA 3',
    }).expect(201);
    expect(final.body.data.asset).toMatchObject({
      cumulativePrincipal: '2200.0000', currentValue: '2340.0000',
      absoluteReturn: '140.0000', percentageReturn: '6.363636',
    });
    const contributions = await agentA.get(`/api/assets/${appreciatingAssetId}/contributions`).expect(200);
    expect(contributions.body.meta.total).toBe(3);

    await agentA.post('/api/assets').send({
      name: 'Laptop', classification: 'depreciating', currency: 'EUR', acquisitionDate: '2025-01-01',
      initialContribution: '1000.00', currentValue: '800.00', depreciation: 'straight_line',
      usefulLifeDays: 1095, residualValue: '100.00',
    }).expect(201);
    await agentA.post('/api/assets').send({
      name: 'Collectible', classification: 'custom', currency: 'EUR', acquisitionDate: '2025-02-01',
      initialContribution: '50.00', currentValue: '50.00',
    }).expect(201);
    await agentB.get(`/api/assets/${appreciatingAssetId}`).expect(404);
  });

  it('uses the valuation trigger once per current-value update and preserves history', async () => {
    const before = await agentA.get(`/api/assets/${appreciatingAssetId}/valuations`).expect(200);
    await agentA.post(`/api/assets/${appreciatingAssetId}/valuations`).send({
      value: '2340.00', note: 'Same-value observation', setAsCurrent: true,
    }).expect(201);
    await agentA.patch(`/api/assets/${appreciatingAssetId}`).send({ currentValue: '2350.00' }).expect(200);
    const after = await agentA.get(`/api/assets/${appreciatingAssetId}/valuations`).expect(200);
    expect(after.body.meta.total).toBe(before.body.meta.total + 2);
  });

  it('supports liability CRUD without inventing a repayment engine', async () => {
    liabilityId = (await agentA.post('/api/liabilities').send({
      name: 'Student loan', lender: 'Bank', currency: 'EUR', originalPrincipal: '1000.00',
      outstandingBalance: '900.00', annualInterestRate: '4.500000', openedOn: '2025-01-01',
    }).expect(201)).body.data.id;
    await agentA.patch(`/api/liabilities/${liabilityId}`).send({ outstandingBalance: '850.00' }).expect(200)
      .expect(({ body }) => expect(body.data.outstandingBalance).toBe('850.0000'));
    await agentB.get(`/api/liabilities/${liabilityId}`).expect(404);
  });

  it('supports recurring templates and pausing without a scheduler', async () => {
    recurringId = (await agentA.post('/api/recurring-rules').send({
      name: 'Subscription', kind: 'expense', sourceAccountId: bankId, categoryId,
      amount: '9.99', currency: 'EUR', intervalCount: 1, intervalUnit: 'month',
      startsOn: '2026-01-01', nextDueOn: '2026-02-01',
    }).expect(201)).body.data.id;
    await agentA.patch(`/api/recurring-rules/${recurringId}`).send({ amount: '10.99' }).expect(200);
    await agentB.get(`/api/recurring-rules/${recurringId}`).expect(404);
    await agentA.delete(`/api/recurring-rules/${recurringId}`).expect(204);
    await agentA.get(`/api/recurring-rules/${recurringId}`).expect(200)
      .expect(({ body }) => expect(body.data.isActive).toBe(false));
  });

  it('separates cash, utility, transfers, investments, liabilities, and local-day buckets', async () => {
    const jan1 = await agentA.get('/api/dashboard?timeframe=daily&anchor=2026-01-01').expect(200);
    expect(jan1.body.data.cashFlow).toEqual([]);

    const jan2 = await agentA.get('/api/dashboard?timeframe=daily&anchor=2026-01-02').expect(200);
    const cash = jan2.body.data.cashFlow.find((row: any) => row.currency === 'EUR');
    expect(cash).toMatchObject({
      actualSpending: '1229.9900', actualIncome: '100.0000', ordinaryNetCashFlow: '-1129.9900',
      assetPurchases: '100.0000',
    });
    expect(jan2.body.data.utilityImpact.find((row: any) => row.currency === 'EUR').utilityAdjustedCost)
      .toBe('33.277671');
    expect(jan2.body.data.liabilitySummary.find((row: any) => row.currency === 'EUR').outstandingBalance)
      .toBe('850.0000');
    const bank = jan2.body.data.accountBalances.find((row: any) => row.accountId === bankId);
    expect(bank.currentBalance).toBe('3269.7100');
    expect(cash.actualIncome).toBe('100.0000'); // Asset appreciation is not cash income.
  });

  it('voids rather than hard-deletes transactions and removes their analytical impact', async () => {
    await agentA.delete(`/api/transactions/${standardExpenseId}?reason=mistake`).expect(204);
    const historical = await agentA.get(`/api/transactions/${standardExpenseId}`).expect(200);
    expect(historical.body.data.voidedAt).toBeTruthy();
    const dashboard = await agentA.get('/api/dashboard?timeframe=daily&anchor=2026-01-02').expect(200);
    expect(dashboard.body.data.cashFlow.find((row: any) => row.currency === 'EUR').actualSpending).toBe('1200.0000');
  });
});
