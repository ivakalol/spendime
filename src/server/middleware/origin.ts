import type { RequestHandler } from 'express';
import type { AppConfig } from '../config.js';
import { ApiError } from '../errors.js';

export function requireSameOrigin(config: AppConfig): RequestHandler {
  return (request, _response, next) => {
    if (request.get('sec-fetch-site') === 'cross-site') {
      next(new ApiError(403, 'cross_site_request_blocked', 'Cross-site request blocked.'));
      return;
    }
    const origin = request.get('origin');
    if (origin) {
      const expectedOrigin = config.appOrigin ?? `${request.protocol}://${request.get('host')}`;
      if (origin !== expectedOrigin) {
        next(new ApiError(403, 'origin_not_allowed', 'Request origin is not allowed.'));
        return;
      }
    }
    next();
  };
}
