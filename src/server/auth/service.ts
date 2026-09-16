import type pg from 'pg';
import type { AppConfig } from '../config.js';
import { ApiError } from '../errors.js';
import {
  createSessionAfterLogin,
  findCredentialByEmail,
  recordFailedLogin,
  registerUser,
} from './repository.js';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password.js';
import { generateSessionToken, hashSessionToken } from './session.js';
import type { SafeUser } from './types.js';

interface RequestMetadata {
  userAgent: string | null;
  ipAddress: string | null;
}

export interface AuthResult {
  user: SafeUser;
  sessionToken: string;
}

function sessionExpiry(config: AppConfig): Date {
  return new Date(Date.now() + config.sessionTtlHours * 60 * 60 * 1_000);
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export async function register(
  pool: pg.Pool,
  config: AppConfig,
  input: { email: string; password: string; displayName: string },
  metadata: RequestMetadata,
): Promise<AuthResult> {
  const passwordHash = await hashPassword(input.password);
  const sessionToken = generateSessionToken();
  try {
    const user = await registerUser(pool, {
      email: input.email,
      displayName: input.displayName,
      passwordHash,
      sessionTokenHash: hashSessionToken(sessionToken),
      sessionExpiresAt: sessionExpiry(config),
      userAgent: metadata.userAgent,
      ipAddress: metadata.ipAddress,
    });
    return { user, sessionToken };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(409, 'account_exists', 'An account with this email already exists.');
    }
    throw error;
  }
}

export async function login(
  pool: pg.Pool,
  config: AppConfig,
  input: { email: string; password: string },
  metadata: RequestMetadata,
): Promise<AuthResult> {
  const credential = await findCredentialByEmail(pool, input.email);
  const passwordMatches = await verifyPassword(
    credential?.password_hash ?? DUMMY_PASSWORD_HASH,
    input.password,
  );
  const isLocked = credential?.locked_until && credential.locked_until.getTime() > Date.now();

  if (!credential || !passwordMatches || credential.status !== 'active' || isLocked) {
    if (credential && !passwordMatches) await recordFailedLogin(pool, credential.user_id);
    throw new ApiError(401, 'invalid_credentials', 'Invalid email or password.');
  }

  const sessionToken = generateSessionToken();
  const user = await createSessionAfterLogin(pool, {
    userId: credential.user_id,
    sessionTokenHash: hashSessionToken(sessionToken),
    sessionExpiresAt: sessionExpiry(config),
    userAgent: metadata.userAgent,
    ipAddress: metadata.ipAddress,
  });
  return { user, sessionToken };
}
