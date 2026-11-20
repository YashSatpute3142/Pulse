import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

const handler = (_req, res, _next, options) => {
  const retryAfter = Math.max(1, Math.ceil(options.windowMs / 1000));
  const reset = res.getHeader('Retry-After') || retryAfter;
  const err = new ApiError(ERROR_CODES.RATE_LIMITED, 'Too many requests. Please slow down.', undefined, { headers: { 'Retry-After': String(reset) } });
  res.setHeader('Retry-After', String(reset));
  res.status(429).json({ error: { code: err.code, message: err.message } });
};

const base = { windowMs: 60_000, standardHeaders: 'draft-7', legacyHeaders: false, handler };

/** Credential endpoints (register, login, change password): API_CONTRACT 1, 10/min/IP. */
export const authLimiter = (max = env.RATE_LIMIT_AUTH_PER_MIN) =>
  rateLimit({ ...base, limit: max, keyGenerator: (req) => ipKeyGenerator(req.ip) });

/** General limiter: 120/min per authenticated user, per IP when anonymous. */
export const apiLimiter = (max = env.RATE_LIMIT_API_PER_MIN) =>
  rateLimit({ ...base, limit: max, keyGenerator: (req) => (req.user?.id ? `u:${req.user.id}` : `ip:${ipKeyGenerator(req.ip)}`) });
