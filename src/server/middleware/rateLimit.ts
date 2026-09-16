import type { RequestHandler } from 'express';

interface Entry {
  count: number;
  resetsAt: number;
}

export function createRateLimiter(maxRequests: number, windowMs: number): RequestHandler {
  const entries = new Map<string, Entry>();
  return (request, response, next) => {
    const now = Date.now();
    const key = request.ip || request.socket.remoteAddress || 'unknown';
    const existing = entries.get(key);
    const entry = !existing || existing.resetsAt <= now
      ? { count: 0, resetsAt: now + windowMs }
      : existing;
    entry.count += 1;
    entries.set(key, entry);

    if (entries.size > 10_000) {
      for (const [candidateKey, candidate] of entries) {
        if (candidate.resetsAt <= now) entries.delete(candidateKey);
      }
    }
    response.setHeader('X-RateLimit-Limit', String(maxRequests));
    response.setHeader('X-RateLimit-Remaining', String(Math.max(0, maxRequests - entry.count)));
    if (entry.count > maxRequests) {
      response.setHeader('Retry-After', String(Math.ceil((entry.resetsAt - now) / 1_000)));
      response.status(429).json({
        error: { code: 'rate_limited', message: 'Too many authentication attempts. Try again later.' },
      });
      return;
    }
    next();
  };
}
