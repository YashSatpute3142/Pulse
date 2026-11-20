import { env } from '../config/env.js';
import { LIMITS } from '../constants/limits.js';
import { ttlToMs } from '../utils/crypto.js';

// Scoped to the auth routes so the refresh token is never sent with ordinary API calls.
const base = () => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAMESITE,
  path: '/api/v1/auth',
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
});

export const setRefreshCookie = (res, token) =>
  res.cookie(LIMITS.REFRESH_COOKIE_NAME, token, { ...base(), maxAge: ttlToMs(env.REFRESH_TOKEN_TTL) });
export const clearRefreshCookie = (res) => res.clearCookie(LIMITS.REFRESH_COOKIE_NAME, base());
export const readRefreshCookie = (req) => req.cookies?.[LIMITS.REFRESH_COOKIE_NAME];
