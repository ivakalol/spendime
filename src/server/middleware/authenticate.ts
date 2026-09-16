import type { RequestHandler } from 'express';
import type pg from 'pg';
import { findSession } from '../auth/repository.js';
import { hashSessionToken, readSessionToken } from '../auth/session.js';
import type { AuthenticatedSession } from '../auth/types.js';
import { ApiError } from '../errors.js';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedSession;
    }
  }
}

export function requireAuthentication(pool: pg.Pool): RequestHandler {
  return async (request, _response, next) => {
    const token = readSessionToken(request);
    if (!token) {
      next(new ApiError(401, 'authentication_required', 'Authentication is required.'));
      return;
    }
    const session = await findSession(pool, hashSessionToken(token));
    if (!session) {
      next(new ApiError(401, 'authentication_required', 'Authentication is required.'));
      return;
    }
    request.auth = session;
    next();
  };
}
