import express, { type Express } from 'express';
import helmet from 'helmet';
import type pg from 'pg';
import path from 'node:path';
import { existsSync } from 'node:fs';
import type { AppConfig } from './config.js';
import { errorHandler, notFoundHandler } from './errors.js';
import { createAuthRouter } from './routes/auth.js';
import { createAccountsRouter } from './domains/accounts/routes.js';
import { createAssetsRouter } from './domains/assets/routes.js';
import { createCategoriesRouter } from './domains/categories/routes.js';
import { createDashboardRouter } from './domains/dashboard/routes.js';
import { createLiabilitiesRouter } from './domains/liabilities/routes.js';
import { createRecurringRulesRouter } from './domains/recurring/routes.js';
import { createTransactionsRouter } from './domains/transactions/routes.js';

export function createApp(pool: pg.Pool, config: AppConfig): Express {
  const app = express();
  if (config.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '16kb', strict: true }));

  app.get('/health', async (_request, response) => {
    await pool.query('SELECT 1');
    response.status(200).json({ status: 'ok' });
  });
  app.use('/api/auth', createAuthRouter(pool, config));
  app.use('/api/accounts', createAccountsRouter(pool));
  app.use('/api/categories', createCategoriesRouter(pool));
  app.use('/api/transactions', createTransactionsRouter(pool));
  app.use('/api/assets', createAssetsRouter(pool));
  app.use('/api/liabilities', createLiabilitiesRouter(pool));
  app.use('/api/recurring-rules', createRecurringRulesRouter(pool));
  app.use('/api/dashboard', createDashboardRouter(pool));

  const clientRoot = path.resolve(process.cwd(), 'dist/client');
  if (config.nodeEnv === 'production' && existsSync(path.join(clientRoot, 'index.html'))) {
    app.use('/assets', express.static(path.join(clientRoot, 'assets'), {
      immutable: true,
      maxAge: '1y',
    }));
    app.use(express.static(clientRoot, { index: false, maxAge: '1h' }));
    app.use((request, response, next) => {
      if (request.method === 'GET' && request.accepts('html') &&
          !request.path.startsWith('/api/') && request.path !== '/health') {
        response.setHeader('Cache-Control', 'no-cache');
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
