// UNIT tests (no database): environment validation and cookie policy.
import { describe, it, expect } from 'vitest';
import { parseEnv } from '../../src/config/env.js';

const base = {
  NODE_ENV: 'development',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/pulse',
  JWT_ACCESS_SECRET: 'change-me-access',
  JWT_REFRESH_SECRET: 'change-me-refresh',
  CLIENT_ORIGINS: 'http://localhost:5173',
};
const prod = {
  ...base,
  NODE_ENV: 'production',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
  CLIENT_ORIGINS: 'https://pulse.vercel.app',
  CLOUDINARY_CLOUD_NAME: 'x', CLOUDINARY_API_KEY: 'y', CLOUDINARY_API_SECRET: 'z',
};

describe('parseEnv', () => {
  it('accepts the documented .env.example values in development', () => {
    const e = parseEnv(base);
    expect(e.PORT).toBe(8080);
    expect(e.CLIENT_ORIGINS_LIST).toEqual(['http://localhost:5173']);
    expect(e.BCRYPT_COST).toBe(12);
  });
  it('development: SameSite=Lax, not Secure', () => {
    const e = parseEnv(base);
    expect(e.COOKIE_SAMESITE).toBe('lax');
    expect(e.COOKIE_SECURE).toBe(false);
  });
  it('production: SameSite=None and Secure by default (owner decision)', () => {
    const e = parseEnv(prod);
    expect(e.COOKIE_SAMESITE).toBe('none');
    expect(e.COOKIE_SECURE).toBe(true);
  });
  it('fails fast listing every problem', () => {
    expect(() => parseEnv({})).toThrow(/MONGODB_URI[\s\S]*JWT_ACCESS_SECRET[\s\S]*CLIENT_ORIGINS/);
  });
  it('rejects identical access and refresh secrets', () => {
    expect(() => parseEnv({ ...base, JWT_REFRESH_SECRET: base.JWT_ACCESS_SECRET })).toThrow(/must differ/);
  });
  it('rejects wildcard and malformed origins', () => {
    expect(() => parseEnv({ ...base, CLIENT_ORIGINS: '*' })).toThrow(/wildcard/);
    expect(() => parseEnv({ ...base, CLIENT_ORIGINS: 'http://localhost:5173/' })).toThrow(/invalid origin/);
  });
  it('production rejects placeholder/short secrets, low bcrypt cost, http origins, missing Cloudinary', () => {
    expect(() => parseEnv({ ...prod, JWT_ACCESS_SECRET: 'change-me-' + 'a'.repeat(30) })).toThrow(/placeholder/);
    expect(() => parseEnv({ ...prod, JWT_ACCESS_SECRET: 'short-but-16-chars!' })).toThrow(/at least 32/);
    expect(() => parseEnv({ ...prod, BCRYPT_COST: '10' })).toThrow(/at least 12/);
    expect(() => parseEnv({ ...prod, CLIENT_ORIGINS: 'http://pulse.example.com' })).toThrow(/must be https/);
    expect(() => parseEnv({ ...prod, CLOUDINARY_API_KEY: '' })).toThrow(/CLOUDINARY_API_KEY/);
  });
});
