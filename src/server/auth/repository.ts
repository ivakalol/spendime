import type pg from 'pg';
import { withTransaction } from '../db/transactions.js';
import type { AuthenticatedSession, SafeUser } from './types.js';

interface CredentialRow {
  user_id: string;
  password_hash: string;
  status: 'active' | 'disabled';
  locked_until: Date | null;
}

interface SessionInput {
  sessionTokenHash: string;
  sessionExpiresAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
}

interface RegisterInput extends SessionInput {
  email: string;
  displayName: string;
  passwordHash: string;
}

interface CreateSessionInput extends SessionInput {
  userId: string;
}

const SAFE_USER_COLUMNS = `
  id,
  email::text AS email,
  display_name AS "displayName",
  base_currency AS "baseCurrency",
  onboarding_completed_at AS "onboardingCompletedAt",
  timezone,
  email_verified_at AS "emailVerifiedAt",
  created_at AS "createdAt"
`;

export async function registerUser(pool: pg.Pool, input: RegisterInput): Promise<SafeUser> {
  return withTransaction(pool, async (client) => {
    const userResult = await client.query<SafeUser>(
      `INSERT INTO users (email, display_name)
       VALUES ($1, $2)
       RETURNING ${SAFE_USER_COLUMNS}`,
      [input.email, input.displayName],
    );
    const user = userResult.rows[0];
    if (!user) throw new Error('User insert did not return a row');

    await client.query(
      'INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)',
      [user.id, input.passwordHash],
    );
    await client.query(
      `INSERT INTO auth_identities (user_id, provider, provider_subject, provider_email)
       VALUES ($1, 'password', $2, $3)`,
      [user.id, user.id, input.email],
    );
    await client.query(
      `INSERT INTO auth_sessions
         (user_id, token_hash, user_agent, ip_address, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, input.sessionTokenHash, input.userAgent, input.ipAddress, input.sessionExpiresAt],
    );
    return user;
  });
}

export async function findCredentialByEmail(
  pool: pg.Pool,
  email: string,
): Promise<CredentialRow | null> {
  const result = await pool.query<CredentialRow>(
    `SELECT u.id AS user_id, c.password_hash, u.status, c.locked_until
     FROM users u
     JOIN user_credentials c ON c.user_id = u.id
     WHERE u.email = $1`,
    [email],
  );
  return result.rows[0] ?? null;
}

export async function recordFailedLogin(pool: pg.Pool, userId: string): Promise<void> {
  await pool.query(
    `UPDATE user_credentials
     SET failed_login_attempts = failed_login_attempts + 1,
         locked_until = CASE
           WHEN failed_login_attempts + 1 >= 5 THEN now() + interval '15 minutes'
           ELSE locked_until
         END
     WHERE user_id = $1`,
    [userId],
  );
}

export async function createSessionAfterLogin(
  pool: pg.Pool,
  input: CreateSessionInput,
): Promise<SafeUser> {
  return withTransaction(pool, async (client) => {
    await client.query(
      `UPDATE user_credentials
       SET failed_login_attempts = 0, locked_until = NULL
       WHERE user_id = $1`,
      [input.userId],
    );
    await client.query(
      `INSERT INTO auth_sessions
         (user_id, token_hash, user_agent, ip_address, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.userId, input.sessionTokenHash, input.userAgent, input.ipAddress, input.sessionExpiresAt],
    );
    const userResult = await client.query<SafeUser>(
      `SELECT ${SAFE_USER_COLUMNS} FROM users WHERE id = $1 AND status = 'active'`,
      [input.userId],
    );
    const user = userResult.rows[0];
    if (!user) throw new Error('Active user was not found while creating session');
    return user;
  });
}

export async function findSession(
  pool: pg.Pool,
  sessionTokenHash: string,
): Promise<AuthenticatedSession | null> {
  const result = await pool.query<AuthenticatedSession>(
    `SELECT s.id AS "sessionId", s.expires_at AS "expiresAt",
       json_build_object(
         'id', u.id,
         'email', u.email::text,
         'displayName', u.display_name,
         'baseCurrency', u.base_currency,
         'onboardingCompletedAt', u.onboarding_completed_at,
         'timezone', u.timezone,
         'emailVerifiedAt', u.email_verified_at,
         'createdAt', u.created_at
       ) AS user
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > now()
       AND u.status = 'active'`,
    [sessionTokenHash],
  );
  return result.rows[0] ?? null;
}

export async function revokeSession(pool: pg.Pool, sessionTokenHash: string): Promise<void> {
  await pool.query(
    `UPDATE auth_sessions SET revoked_at = now()
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [sessionTokenHash],
  );
}
