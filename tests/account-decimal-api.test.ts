import express from 'express';
import type pg from 'pg';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../src/server/errors.js';
import { createAccountsRouter } from '../src/server/domains/accounts/routes.js';

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), get: vi.fn() }));
vi.mock('../src/server/middleware/authenticate.js', () => ({ requireAuthentication: () => (req: any, _res: any, next: () => void) => {
  req.auth = { user: { id: 'user' } }; next();
} }));
vi.mock('../src/server/domains/accounts/repository.js', () => ({ createAccount: mocks.create, updateAccount: mocks.update,
  getAccount: mocks.get, listAccounts: vi.fn(), archiveAccount: vi.fn(), restoreAccount: vi.fn(), permanentlyDeleteAccount: vi.fn() }));
const id = '00000000-0000-4000-8000-000000000001';
const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
const app = express(); app.use(express.json());
app.use('/accounts', createAccountsRouter({ connect: async () => client } as unknown as pg.Pool));
app.use(errorHandler);
beforeEach(() => {
  mocks.create.mockReset().mockImplementation(async (_client, _userId, input) => ({ id, ...input }));
  mocks.update.mockReset().mockImplementation(async (_client, _id, input) => ({ id, ...input }));
  mocks.get.mockResolvedValue({ id, name: 'Cash', kind: 'cash', currency: 'EUR', openingBalance: '0.0000', institution: null, color: null, icon: null });
});
describe('account opening balance decimal separators', () => {
  it.each(['1,00', '200,20', '200.20', '-200,20'])('creates an account using %s and stores a normalized decimal string', async openingBalance => {
    const response = await request(app).post('/accounts').send({ name: 'Mobile account', kind: 'checking', currency: 'EUR', openingBalance }).expect(201);
    expect(response.body.data.openingBalance).toBe(openingBalance.replace(',', '.'));
    expect(mocks.create).toHaveBeenCalledWith(client, 'user', expect.objectContaining({ openingBalance: openingBalance.replace(',', '.') }));
  });
  it('also normalizes a comma balance when editing an account', async () => {
    await request(app).patch(`/accounts/${id}`).send({ openingBalance: '200,20' }).expect(200);
    expect(mocks.update).toHaveBeenCalledWith(client, id, expect.objectContaining({ openingBalance: '200.20' }));
  });
  it('rejects mixed decimal separators instead of misinterpreting the balance', async () => {
    await request(app).post('/accounts').send({ name: 'Cash', kind: 'cash', currency: 'EUR', openingBalance: '1,200.20' }).expect(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
