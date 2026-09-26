import type { Express } from 'express';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';
import { loadConfig, type AppConfig } from '../src/server/config.js';
import { assertSafeRuntimeRole, createPool } from '../src/server/db/pool.js';
import { withUserTransaction } from '../src/server/db/transactions.js';

describe('authentication API with PostgreSQL', () => {
  let app: Express;
  let pool: pg.Pool;
  let config: AppConfig;
  const unique = `${Date.now()}-${crypto.randomUUID()}`;
  const emailA = `auth-a-${unique}@example.test`;
  const emailB = `auth-b-${unique}@example.test`;
  const password = 'Correct-Horse-47!';
  let userAId: string;
  let userBId: string;
  let agentA: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    config = loadConfig({
      ...process.env,
      NODE_ENV: 'test',
      COOKIE_SECURE: 'never',
      AUTH_RATE_LIMIT_MAX: '100',
      AUTH_RATE_LIMIT_WINDOW_MINUTES: '1',
    });
    pool = createPool(config.databaseUrl, 3);
    await assertSafeRuntimeRole(pool);
    app = createApp(pool, config);
    agentA = request.agent(app);
  });

  afterAll(async () => {
    if (pool) {
      await pool.query('DELETE FROM users WHERE email::text = ANY($1::text[])', [[emailA, emailB]]);
      await pool.end();
    }
  });

  it('registers a user atomically and sets a protected session cookie', async () => {
    const response = await agentA
      .post('/api/auth/register')
      .send({ email: `  ${emailA.toUpperCase()}  `, password, displayName: 'Test A' })
      .expect(201);

    expect(response.body.data.user).toMatchObject({ email: emailA, displayName: 'Test A' });
    expect(response.body.data.user).not.toHaveProperty('password_hash');
    userAId = response.body.data.user.id;

    const cookie = response.headers['set-cookie']?.[0];
    expect(cookie).toContain('spendime_session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Secure');

    const stored = await pool.query<{ password_hash: string; token_hash: string }>(
      `SELECT c.password_hash, s.token_hash
       FROM user_credentials c
       JOIN auth_sessions s ON s.user_id = c.user_id
       WHERE c.user_id = $1
       ORDER BY s.created_at ASC LIMIT 1`,
      [userAId],
    );
    expect(stored.rows[0]?.password_hash).toMatch(/^\$argon2id\$/);
    expect(stored.rows[0]?.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(cookie).not.toContain(stored.rows[0]!.token_hash);
  });

  it('rejects duplicate registration without creating partial records', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: emailA, password })
      .expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('account_exists'));

    const count = await pool.query<{ count: string }>(
      'SELECT count(*) FROM users WHERE email = $1',
      [emailA],
    );
    expect(count.rows[0]?.count).toBe('1');
  });

  it('logs in with valid credentials and issues a new session', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: emailA, password })
      .expect(200);
    expect(response.body.data.user.id).toBe(userAId);
    expect(response.headers['set-cookie']?.[0]).toContain('HttpOnly');
  });

  it('uses a generic error for an incorrect password', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ email: emailA, password: 'Definitely-Wrong-47!' })
      .expect(401)
      .expect(({ body }) => {
        expect(body.error).toEqual({
          code: 'invalid_credentials',
          message: 'Invalid email or password.',
        });
      });
  });

  it('keeps login and session lookup working before optional onboarding metadata is migrated', async () => {
    // Shadow only this connection's users relation; never alter the real table.
    const legacyPool = createPool(config.databaseUrl, 1);
    try {
      await legacyPool.query(`CREATE TEMP VIEW users AS
        SELECT id, email, display_name, base_currency, timezone,
          email_verified_at, created_at, status FROM public.users`);
      const agent = request.agent(createApp(legacyPool, config));
      const signedIn = await agent.post('/api/auth/login')
        .send({ email: emailA, password }).expect(200);
      expect(signedIn.body.data.user).toMatchObject({ id: userAId, onboardingCompletedAt: null });
      const session = await agent.get('/api/auth/me').expect(200);
      expect(session.body.data.user).toMatchObject({ id: userAId, onboardingCompletedAt: null });
      await agent.post('/api/auth/logout').expect(200);
    } finally {
      await legacyPool.end();
    }
  });

  it('returns 401 from /me without a session', async () => {
    await request(app)
      .get('/api/auth/me')
      .expect(401)
      .expect(({ body }) => expect(body.error.code).toBe('authentication_required'));
  });

  it('returns only the authenticated user from /me', async () => {
    const response = await agentA.get('/api/auth/me').expect(200);
    expect(response.body.data.user).toMatchObject({ id: userAId, email: emailA });
    expect(JSON.stringify(response.body)).not.toContain('password');
    expect(JSON.stringify(response.body)).not.toContain('token');
  });

  it('rejects malformed registration input', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'short', unexpected: true })
      .expect(400)
      .expect(({ body }) => expect(body.error.code).toBe('validation_error'));
  });

  it('enforces cross-user isolation through transaction-local RLS context', async () => {
    const registration = await request(app)
      .post('/api/auth/register')
      .send({ email: emailB, password, displayName: 'Test B' })
      .expect(201);
    userBId = registration.body.data.user.id;

    const accountId = await withUserTransaction(pool, userAId, async (client) => {
      const result = await client.query<{ id: string }>(
        `INSERT INTO accounts (user_id, name, kind, currency)
         VALUES ($1, 'RLS test account', 'cash', 'EUR') RETURNING id`,
        [userAId],
      );
      return result.rows[0]!.id;
    });

    const visibleToB = await withUserTransaction(pool, userBId, (client) =>
      client.query('SELECT id FROM accounts WHERE id = $1', [accountId]),
    );
    expect(visibleToB.rowCount).toBe(0);

    await expect(
      withUserTransaction(pool, userBId, (client) =>
        client.query(
          `INSERT INTO accounts (user_id, name, kind, currency)
           VALUES ($1, 'Forbidden account', 'cash', 'EUR')`,
          [userAId],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('logs out, clears the cookie, and invalidates the server session', async () => {
    const logout = await agentA.post('/api/auth/logout').expect(200);
    expect(logout.headers['set-cookie']?.[0]).toContain('Max-Age=0');
    await agentA.get('/api/auth/me').expect(401);
  });
});
