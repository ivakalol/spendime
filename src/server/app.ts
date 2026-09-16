import express, { type Express } from 'express';
import helmet from 'helmet';
import type pg from 'pg';
import type { AppConfig } from './config.js';
import { errorHandler, notFoundHandler } from './errors.js';
import { createAuthRouter } from './routes/auth.js';

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
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
