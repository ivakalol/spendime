import pg from 'pg';

const { Pool } = pg;

export function createPool(databaseUrl: string, max = 10): pg.Pool {
  return new Pool({
    connectionString: databaseUrl,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
    application_name: 'spendime-api',
  });
}

export async function assertSafeRuntimeRole(pool: pg.Pool): Promise<void> {
  const result = await pool.query<{
    role_name: string;
    is_superuser: boolean;
    bypasses_rls: boolean;
    owns_protected_tables: boolean;
    protected_table_count: number;
    rls_enabled_count: number;
  }>(`
    SELECT current_user AS role_name,
      r.rolsuper AS is_superuser,
      r.rolbypassrls AS bypasses_rls,
      EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname IN (
            'accounts', 'categories', 'assets', 'asset_valuations',
            'liabilities', 'recurring_rules', 'transactions'
          )
          AND pg_get_userbyid(c.relowner) = current_user
      ) AS owns_protected_tables,
      (
        SELECT count(*)::integer FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname IN (
            'accounts', 'categories', 'assets', 'asset_valuations',
            'liabilities', 'recurring_rules', 'transactions'
          )
      ) AS protected_table_count,
      (
        SELECT count(*)::integer FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relrowsecurity
          AND c.relname IN (
            'accounts', 'categories', 'assets', 'asset_valuations',
            'liabilities', 'recurring_rules', 'transactions'
          )
      ) AS rls_enabled_count
    FROM pg_roles r WHERE r.rolname = current_user
  `);

  const role = result.rows[0];
  if (
    !role ||
    role.is_superuser ||
    role.bypasses_rls ||
    role.owns_protected_tables ||
    role.protected_table_count !== 7 ||
    role.rls_enabled_count !== 7
  ) {
    throw new Error(
      'Unsafe database configuration: runtime role or protected-table RLS checks failed',
    );
  }
}
