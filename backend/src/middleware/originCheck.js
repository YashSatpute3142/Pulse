import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * CSRF guard for the cookie-authenticated endpoints (POST /auth/refresh, /auth/logout).
 * Needed because the refresh cookie is SameSite=None in production.
 *  - Origin present  -> must be in CLIENT_ORIGINS.
 *  - Origin absent   -> browsers always send Origin on cross-site POST, so absence means a non-browser client or a
 *                       same-origin navigation; still reject when Sec-Fetch-Site says cross-site.
 */
export function originCheck(req, _res, next) {
  const origin = req.headers.origin;
  if (origin) {
    if (!env.CLIENT_ORIGINS_LIST.includes(origin)) return next(ApiError.forbidden('Origin not allowed.'));
    return next();
  }
  if (req.headers['sec-fetch-site'] === 'cross-site') return next(ApiError.forbidden('Origin not allowed.'));
  next();
}
