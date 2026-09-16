export type CookieSecureMode = 'auto' | 'always' | 'never';

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  databaseUrl: string;
  dbPoolMax: number;
  sessionTtlHours: number;
  cookieSecureMode: CookieSecureMode;
  trustProxy: boolean;
  appOrigin?: string;
  authRateLimitMax: number;
  authRateLimitWindowMs: number;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function integerInRange(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test, or production');
  }

  const cookieSecureMode = env.COOKIE_SECURE ?? 'auto';
  if (!['auto', 'always', 'never'].includes(cookieSecureMode)) {
    throw new Error('COOKIE_SECURE must be auto, always, or never');
  }

  const appOrigin = env.APP_ORIGIN?.trim().replace(/\/$/, '');
  return {
    nodeEnv: nodeEnv as AppConfig['nodeEnv'],
    host: env.HOSTNAME?.trim() || '0.0.0.0',
    port: integerInRange(env, 'PORT', 3000, 1, 65_535),
    databaseUrl: env.TEST_DATABASE_URL?.trim() || required(env, 'DATABASE_URL'),
    dbPoolMax: integerInRange(env, 'DB_POOL_MAX', 10, 1, 20),
    sessionTtlHours: integerInRange(env, 'SESSION_TTL_HOURS', 720, 1, 8_760),
    cookieSecureMode: cookieSecureMode as CookieSecureMode,
    trustProxy: env.TRUST_PROXY === '1',
    ...(appOrigin ? { appOrigin } : {}),
    authRateLimitMax: integerInRange(env, 'AUTH_RATE_LIMIT_MAX', 10, 1, 1_000),
    authRateLimitWindowMs:
      integerInRange(env, 'AUTH_RATE_LIMIT_WINDOW_MINUTES', 15, 1, 1_440) * 60_000,
  };
}
