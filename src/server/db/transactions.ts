import type pg from 'pg';

export async function withTransaction<T>(
  pool: pg.Pool,
  operation: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function withUserTransaction<T>(
  pool: pg.Pool,
  userId: string,
  operation: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  return withTransaction(pool, async (client) => {
    // Transaction-local state cannot leak when this pooled connection returns.
    // The authenticated server-derived ID remains a query parameter.
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
    return operation(client);
  });
}
