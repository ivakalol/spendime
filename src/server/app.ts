import express, { type Express } from 'express';
import helmet from 'helmet';
import type pg from 'pg';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { bankingCredentialConfig, bankingRuntimeEnabled, type AppConfig } from './config.js';
import { errorHandler, notFoundHandler } from './errors.js';
import { createAuthRouter } from './routes/auth.js';
import { createAccountsRouter } from './domains/accounts/routes.js';
import { createAssetsRouter } from './domains/assets/routes.js';
import { createCategoriesRouter } from './domains/categories/routes.js';
import { createDashboardRouter } from './domains/dashboard/routes.js';
import { createLiabilitiesRouter } from './domains/liabilities/routes.js';
import { createRecurringRulesRouter } from './domains/recurring/routes.js';
import { createTransactionsRouter } from './domains/transactions/routes.js';
import { createBankingRouter } from './domains/banking/routes.js';
import { EnableBankingProvider } from './domains/banking/enableBanking.js';
import type { BankingProvider } from './domains/banking/provider.js';
import { BankingSecrets } from './domains/banking/secrets.js';

export const CACHE_CONTROL = {
  revalidate: 'no-cache, no-store, must-revalidate',
  manifest: 'no-cache, must-revalidate',
  immutable: 'public, max-age=31536000, immutable',
  api: 'no-store',
} as const;

function setRevalidationHeaders(response: express.Response): void {
  response.setHeader('Cache-Control', CACHE_CONTROL.revalidate);
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('Expires', '0');
}

export function setClientStaticHeaders(response: express.Response, filePath: string): void {
  const fileName = path.basename(filePath);
  if (fileName === 'index.html' || fileName === 'sw.js' || fileName === 'sw-cache-migration.js') {
    setRevalidationHeaders(response);
    if (fileName === 'sw.js') response.setHeader('Service-Worker-Allowed', '/');
    return;
  }
  if (fileName === 'manifest.webmanifest') {
    response.setHeader('Cache-Control', CACHE_CONTROL.manifest);
    return;
  }
  if (/^workbox-[A-Za-z0-9_-]+\.js$/.test(fileName)) {
    response.setHeader('Cache-Control', CACHE_CONTROL.immutable);
  }
}

export function createApp(pool: pg.Pool, config: AppConfig, bankingProvider?: BankingProvider): Express {
  const app = express();
  if (config.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '16kb', strict: true }));

  app.get('/health', async (_request, response) => {
    await pool.query('SELECT 1');
    response.setHeader('Cache-Control', CACHE_CONTROL.api);
    response.status(200).json({ status: 'ok' });
  });
  app.use('/api', (_request, response, next) => {
    response.setHeader('Cache-Control', CACHE_CONTROL.api);
    next();
  });
  app.use('/api/auth', createAuthRouter(pool, config));
  app.use('/api/accounts', createAccountsRouter(pool));
  app.use('/api/categories', createCategoriesRouter(pool));
  app.use('/api/transactions', createTransactionsRouter(pool));
  app.use('/api/assets', createAssetsRouter(pool));
  app.use('/api/liabilities', createLiabilitiesRouter(pool));
  app.use('/api/recurring-rules', createRecurringRulesRouter(pool));
  app.use('/api/dashboard', createDashboardRouter(pool));
  const configureBankingProvider = bankingRuntimeEnabled(config) && Boolean(config.bankingOwnerUserId);
  const credentials = bankingCredentialConfig(config);
  const privateKey = configureBankingProvider && credentials.privateKeyFile ? readFileSync(credentials.privateKeyFile, 'utf8')
    : configureBankingProvider && credentials.privateKeyB64 ? Buffer.from(credentials.privateKeyB64, 'base64').toString('utf8') : undefined;
  const provider = configureBankingProvider ? (bankingProvider ?? (credentials.appId && privateKey && credentials.redirectUri
    ? new EnableBankingProvider(credentials.appId, privateKey, credentials.environment, credentials.redirectUri) : undefined)) : undefined;
  if (provider && !credentials.encryptionKeyB64) throw new Error('Banking encryption key is required for banking');
  if (provider && provider.environment !== credentials.environment) throw new Error('Banking provider environment mismatch');
  app.use('/api/banking', createBankingRouter(pool, config, provider,
    credentials.encryptionKeyB64 ? new BankingSecrets(credentials.encryptionKeyB64) : undefined));

  const clientRoot = path.resolve(process.cwd(), 'dist/client');
  if (config.nodeEnv === 'production' && existsSync(path.join(clientRoot, 'index.html'))) {
    app.use('/assets', express.static(path.join(clientRoot, 'assets'), {
      immutable: true,
      maxAge: '1y',
    }));
    app.use(express.static(clientRoot, {
      index: false,
      maxAge: '1h',
      setHeaders: setClientStaticHeaders,
    }));
    app.use((request, response, next) => {
      if (request.method === 'GET' && request.accepts('html') &&
          !request.path.startsWith('/api/') && request.path !== '/health') {
        setRevalidationHeaders(response);
        response.sendFile(path.join(clientRoot, 'index.html'));
        return;
      }
      next();
    });
  }
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
