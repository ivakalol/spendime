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
  bankingRedirectUri?: string;
  enableBankingAppId?: string;
  enableBankingPrivateKeyFile?: string;
  enableBankingPrivateKeyB64?: string;
  bankingEncryptionKeyB64?: string;
  enableBankingProductionAppId?: string;
  enableBankingProductionPrivateKeyFile?: string;
  enableBankingProductionPrivateKeyB64?: string;
  bankingProductionEncryptionKeyB64?: string;
  bankingProductionRedirectUri?: string;
  bankingProductionWorkerEnabled: boolean;
  bankingOwnerUserId?: string;
  bankingProductionEnabled: boolean;
  sandboxSyncIntervalMinutes: number;
  geminiApiKey?: string;
  geminiModel?: string;
  geminiEnabled: boolean;
  geminiPaidProject: boolean;
  geminiPrivacyApproved: boolean;
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
  const configuredOwner = env.BANKING_OWNER_USER_ID?.trim();
  const bankingOwnerUserId = configuredOwner && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(configuredOwner)
    ? configuredOwner.toLowerCase() : undefined;
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
    ...(env.BANKING_REDIRECT_URI?.trim() ? { bankingRedirectUri: env.BANKING_REDIRECT_URI.trim() } : {}),
    ...(env.ENABLE_BANKING_APP_ID?.trim() ? { enableBankingAppId: env.ENABLE_BANKING_APP_ID.trim() } : {}),
    ...(env.ENABLE_BANKING_PRIVATE_KEY_FILE?.trim() ? { enableBankingPrivateKeyFile: env.ENABLE_BANKING_PRIVATE_KEY_FILE.trim() } : {}),
    ...(env.ENABLE_BANKING_PRIVATE_KEY_B64?.trim() ? { enableBankingPrivateKeyB64: env.ENABLE_BANKING_PRIVATE_KEY_B64.trim() } : {}),
    ...(env.BANKING_ENCRYPTION_KEY_B64?.trim() ? { bankingEncryptionKeyB64: env.BANKING_ENCRYPTION_KEY_B64.trim() } : {}),
    ...(env.ENABLE_BANKING_PRODUCTION_APP_ID?.trim() ? { enableBankingProductionAppId: env.ENABLE_BANKING_PRODUCTION_APP_ID.trim() } : {}),
    ...(env.ENABLE_BANKING_PRODUCTION_PRIVATE_KEY_FILE?.trim() ? { enableBankingProductionPrivateKeyFile: env.ENABLE_BANKING_PRODUCTION_PRIVATE_KEY_FILE.trim() } : {}),
    ...(env.ENABLE_BANKING_PRODUCTION_PRIVATE_KEY_B64?.trim() ? { enableBankingProductionPrivateKeyB64: env.ENABLE_BANKING_PRODUCTION_PRIVATE_KEY_B64.trim() } : {}),
    ...(env.BANKING_PRODUCTION_ENCRYPTION_KEY_B64?.trim() ? { bankingProductionEncryptionKeyB64: env.BANKING_PRODUCTION_ENCRYPTION_KEY_B64.trim() } : {}),
    ...(env.BANKING_PRODUCTION_REDIRECT_URI?.trim() ? { bankingProductionRedirectUri: env.BANKING_PRODUCTION_REDIRECT_URI.trim() } : {}),
    bankingProductionWorkerEnabled: env.BANKING_PRODUCTION_WORKER_ENABLED === '1',
    ...(bankingOwnerUserId ? { bankingOwnerUserId } : {}),
    bankingProductionEnabled: env.BANKING_PRODUCTION_ENABLED === '1',
    // Applies only to Enable Banking Mock ASPSP in a non-production runtime.
    sandboxSyncIntervalMinutes: nodeEnv === 'production' ? 360 :
      integerInRange(env, 'BANKING_SANDBOX_SYNC_INTERVAL_MINUTES', 360, 5, 360),
    ...(env.GEMINI_API_KEY?.trim() ? { geminiApiKey: env.GEMINI_API_KEY.trim() } : {}),
    ...(env.GEMINI_MODEL?.trim() ? { geminiModel: env.GEMINI_MODEL.trim() } : {}),
    geminiEnabled: env.GEMINI_ENABLED === '1',
    geminiPaidProject: env.GEMINI_PAID_PROJECT === '1',
    geminiPrivacyApproved: env.GEMINI_PRIVACY_APPROVED === '1',
  };
}

export function hasBankingAccess(config: AppConfig, authenticatedUserId: string): boolean {
  return Boolean(config.bankingOwnerUserId && config.bankingOwnerUserId === authenticatedUserId.toLowerCase());
}

export function bankingRuntimeEnabled(config: AppConfig): boolean {
  return config.nodeEnv !== 'production' || config.bankingProductionEnabled;
}

export function bankingCredentialConfig(config: AppConfig) {
  return config.nodeEnv === 'production' ? {
    appId: config.enableBankingProductionAppId,
    privateKeyFile: config.enableBankingProductionPrivateKeyFile,
    privateKeyB64: config.enableBankingProductionPrivateKeyB64,
    encryptionKeyB64: config.bankingProductionEncryptionKeyB64,
    redirectUri: config.bankingProductionRedirectUri,
    environment: 'production' as const,
  } : {
    appId: config.enableBankingAppId,
    privateKeyFile: config.enableBankingPrivateKeyFile,
    privateKeyB64: config.enableBankingPrivateKeyB64,
    encryptionKeyB64: config.bankingEncryptionKeyB64,
    redirectUri: config.bankingRedirectUri,
    environment: 'sandbox' as const,
  };
}
