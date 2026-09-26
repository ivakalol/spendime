import { z } from 'zod';
import { currencySchema } from '../validation/common.js';
import { inUserTransaction } from './helpers.js';
import { ApiError } from '../errors.js';
import { Router, type Request } from 'express';
import type pg from 'pg';
import { revokeSession } from '../auth/repository.js';
import { login, register } from '../auth/service.js';
import {
  clearSessionCookie,
  hashSessionToken,
  readSessionToken,
  setSessionCookie,
} from '../auth/session.js';
import { bankingRuntimeEnabled, hasBankingAccess, type AppConfig } from '../config.js';
import { requireAuthentication } from '../middleware/authenticate.js';
import { requireSameOrigin } from '../middleware/origin.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { loginSchema, registerSchema } from '../validation/auth.js';

function requestMetadata(request: Request): { userAgent: string | null; ipAddress: string | null } {
  return {
    userAgent: request.get('user-agent')?.slice(0, 500) ?? null,
    ipAddress: request.ip || request.socket.remoteAddress || null,
  };
}

export function createAuthRouter(pool: pg.Pool, config: AppConfig, providerReady = false): Router {
  const router = Router();
  const sameOrigin = requireSameOrigin(config);
  const rateLimit = createRateLimiter(config.authRateLimitMax, config.authRateLimitWindowMs);

  router.post('/register', sameOrigin, rateLimit, async (request, response) => {
    const input = registerSchema.parse(request.body);
    const result = await register(pool, config, input, requestMetadata(request));
    setSessionCookie(request, response, result.sessionToken, config);
    response.status(201).json({ data: { user: result.user } });
  });

  router.post('/login', sameOrigin, rateLimit, async (request, response) => {
    const input = loginSchema.parse(request.body);
    const result = await login(pool, config, input, requestMetadata(request));
    setSessionCookie(request, response, result.sessionToken, config);
    response.status(200).json({ data: { user: result.user } });
  });

  router.post('/logout', sameOrigin, async (request, response) => {
    const token = readSessionToken(request);
    if (token) await revokeSession(pool, hashSessionToken(token));
    clearSessionCookie(request, response, config);
    response.status(200).json({ data: { loggedOut: true } });
  });

  router.get('/me', requireAuthentication(pool), (request, response) => {
    const bankingAccess = hasBankingAccess(config, request.auth!.user.id);
    response.status(200).json({ data: { user: { ...request.auth!.user, bankingAccess,
      bankingEnabled: bankingAccess && bankingRuntimeEnabled(config) && providerReady,
      bankingStatus: !bankingAccess ? 'restricted' : !bankingRuntimeEnabled(config) ? 'disabled' : !providerReady ? 'unconfigured' : 'ready',
      ...(bankingAccess ? { bankingEnvironment: config.nodeEnv === 'production' ? 'production' : 'sandbox' } : {}) } } });
  });
  router.patch('/preferences', requireAuthentication(pool), sameOrigin, async (request, response) => {
    const input = z.object({ baseCurrency: currencySchema.optional(), timezone: z.string().max(100).optional(), completeOnboarding: z.literal(true).optional() }).strict().parse(request.body);
    await inUserTransaction(pool, request, async (client, userId) => {
      if (input.timezone && !(await client.query('SELECT 1 FROM pg_timezone_names WHERE name=$1', [input.timezone])).rowCount)
        throw new ApiError(400, 'invalid_timezone', 'Choose a valid timezone.');
      await client.query(`UPDATE users SET base_currency=COALESCE($2,base_currency), timezone=COALESCE($3,timezone),
        onboarding_completed_at=CASE WHEN $4 THEN COALESCE(onboarding_completed_at,now()) ELSE onboarding_completed_at END
        WHERE id=$1`, [userId,input.baseCurrency ?? null,input.timezone ?? null,input.completeOnboarding ?? false]);
    });
    response.json({ data: { saved: true } });
  });
  return router;
}
