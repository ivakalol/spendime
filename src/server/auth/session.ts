import { createHash, randomBytes } from 'node:crypto';
import { parseCookie, stringifySetCookie } from 'cookie';
import type { Request, Response } from 'express';
import type { AppConfig } from '../config.js';

export const SESSION_COOKIE_NAME = 'spendime_session';

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function readSessionToken(request: Request): string | null {
  const header = request.headers.cookie;
  if (!header) return null;
  const token = parseCookie(header)[SESSION_COOKIE_NAME];
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

function isSecureRequest(request: Request, config: AppConfig): boolean {
  if (config.cookieSecureMode === 'always') return true;
  if (config.cookieSecureMode === 'never') return false;
  return request.secure;
}

export function setSessionCookie(
  request: Request,
  response: Response,
  token: string,
  config: AppConfig,
): void {
  response.setHeader(
    'Set-Cookie',
    stringifySetCookie({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: isSecureRequest(request, config),
      sameSite: 'lax',
      path: '/',
      maxAge: config.sessionTtlHours * 60 * 60,
    }),
  );
}

export function clearSessionCookie(
  request: Request,
  response: Response,
  config: AppConfig,
): void {
  response.setHeader(
    'Set-Cookie',
    stringifySetCookie({
      name: SESSION_COOKIE_NAME,
      value: '',
      httpOnly: true,
      secure: isSecureRequest(request, config),
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
      expires: new Date(0),
    }),
  );
}
