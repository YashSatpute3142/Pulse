import 'dotenv/config';
import { z } from 'zod';

const int = (def) => z.coerce.number().int().positive().default(def);
const MIN_SECRET_PROD = 32;

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: int(8080),
    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
    JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
    JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
    ACCESS_TOKEN_TTL: z.string().regex(/^\d+[smhd]$/, 'use e.g. 15m').default('15m'),
    REFRESH_TOKEN_TTL: z.string().regex(/^\d+[smhd]$/, 'use e.g. 7d').default('7d'),
    WS_TICKET_TTL_SEC: int(30),
    CLIENT_ORIGINS: z.string().min(1, 'CLIENT_ORIGINS is required'),
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).optional(),
    COOKIE_DOMAIN: z.string().optional().default(''),
    // Optional: comma-separated DNS servers for Node only (fixes querySrv ECONNREFUSED for mongodb+srv:// on some networks).
    DNS_SERVERS: z.string().optional().default(''),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    // Required in production; optional in dev/test until the Uploads step (see superRefine).
    CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
    CLOUDINARY_API_KEY: z.string().optional().default(''),
    CLOUDINARY_API_SECRET: z.string().optional().default(''),
    MAX_UPLOAD_MB: int(10),
    RATE_LIMIT_AUTH_PER_MIN: int(10),
    RATE_LIMIT_API_PER_MIN: int(120),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
  })
  .superRefine((e, ctx) => {
    const add = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message });
    const prod = e.NODE_ENV === 'production';

    if (e.JWT_ACCESS_SECRET === e.JWT_REFRESH_SECRET) add('JWT_REFRESH_SECRET', 'must differ from JWT_ACCESS_SECRET');
    if (prod) {
      for (const k of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
        if (e[k].length < MIN_SECRET_PROD) add(k, `must be at least ${MIN_SECRET_PROD} characters in production`);
        if (/change-me/i.test(e[k])) add(k, 'placeholder secret is not allowed in production');
      }
      if (e.BCRYPT_COST < 12) add('BCRYPT_COST', 'must be at least 12 in production');
      for (const k of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) {
        if (!e[k]) add(k, 'is required in production');
      }
    }
    const origins = e.CLIENT_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
    if (origins.length === 0) add('CLIENT_ORIGINS', 'at least one origin is required');
    for (const o of origins) {
      if (o === '*') add('CLIENT_ORIGINS', 'wildcard origin is not allowed (credentials are used)');
      else if (!/^https?:\/\/[^/\s]+$/.test(o)) add('CLIENT_ORIGINS', `invalid origin "${o}" (no path or trailing slash)`);
      else if (prod && !o.startsWith('https://') && !/^http:\/\/localhost(:\d+)?$/.test(o)) add('CLIENT_ORIGINS', `production origin must be https: "${o}"`);
    }
    if (e.COOKIE_SAMESITE === 'none' && origins.length === 0) add('COOKIE_SAMESITE', 'none requires an explicit origin list');
  });

export function parseEnv(source = process.env) {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  const e = parsed.data;
  const prod = e.NODE_ENV === 'production';
  // Owner decision: Lax in development, None in production (cross-site Vercel -> Render).
  const sameSite = e.COOKIE_SAMESITE ?? (prod ? 'none' : 'lax');
  return Object.freeze({
    ...e,
    CLIENT_ORIGINS_LIST: Object.freeze(e.CLIENT_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)),
    COOKIE_SAMESITE: sameSite,
    COOKIE_SECURE: prod || sameSite === 'none', // browsers require Secure with SameSite=None
    IS_PROD: prod,
    IS_TEST: e.NODE_ENV === 'test',
  });
}

export const env = parseEnv();
