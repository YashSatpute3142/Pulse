import crypto from 'node:crypto';
import { env } from '../config/env.js';

/** Keyed hash (HMAC-SHA256 with JWT_REFRESH_SECRET). Only this hash is stored for refresh tokens. */
export const hashRefreshToken = (token) => crypto.createHmac('sha256', env.JWT_REFRESH_SECRET).update(token).digest('hex');
export const randomToken = (bytes = 48) => crypto.randomBytes(bytes).toString('base64url');
export const randomId = () => crypto.randomUUID();

/** "15m" | "7d" -> milliseconds */
export function ttlToMs(ttl) {
  const m = /^(\d+)([smhd])$/.exec(ttl);
  const n = Number(m[1]);
  return n * { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2]];
}
