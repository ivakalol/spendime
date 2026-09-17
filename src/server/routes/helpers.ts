import type { Request } from 'express';
import type pg from 'pg';
import { ApiError } from '../errors.js';
import { withUserTransaction } from '../db/transactions.js';

export function authenticatedUserId(request: Request): string {
  if (!request.auth) throw new ApiError(401, 'authentication_required', 'Authentication is required.');
  return request.auth.user.id;
}

export function inUserTransaction<T>(
  pool: pg.Pool,
  request: Request,
  operation: (client: pg.PoolClient, userId: string) => Promise<T>,
): Promise<T> {
  const userId = authenticatedUserId(request);
  return withUserTransaction(pool, userId, (client) => operation(client, userId));
}

export function requireRow<T>(row: T | undefined): T {
  if (!row) throw new ApiError(404, 'not_found', 'The requested resource was not found.');
  return row;
}

export function pickFields(
  source: Record<string, unknown>, keys: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [key, source[key]]));
}
