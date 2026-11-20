// INTEGRATION: rate limiting (own app instance with tiny limits) against the real database.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestApp, bearer, mongoose } from '../helpers/app.js';
import { User } from '../../src/models/User.js';
import { signAccessToken } from '../../src/services/token.service.js';

let t;
beforeAll(async () => { t = await startTestApp({ auth: 3, api: 5 }); });
afterAll(async () => { await mongoose.connection.dropDatabase(); await t.stop(); });

describe('rate limits (API_CONTRACT 1)', () => {
  it('credential endpoints: 429 RATE_LIMITED with Retry-After after the limit (per IP)', async () => {
    const statuses = [];
    let last;
    for (let i = 0; i < 5; i += 1) {
      last = await t.http().post('/api/v1/auth/login').send({ identifier: 'nobody@example.com', password: 'whatever12' });
      statuses.push(last.status);
    }
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
    expect(last.body.error.code).toBe('RATE_LIMITED');
    expect(Number(last.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('general limiter is per authenticated user (5/min here), not shared between users', async () => {
    const mk = async (n) => {
      const u = await User.create({ username: `rl_${n}`, email: `rl${n}@example.com`, passwordHash: 'x', displayName: `RL ${n}` });
      return signAccessToken(u);
    };
    const [ta, tb] = [await mk('a'), await mk('b')];
    const codes = [];
    for (let i = 0; i < 6; i += 1) codes.push((await t.http().get('/api/v1/auth/me').set(bearer(ta))).status);
    expect(codes).toEqual([200, 200, 200, 200, 200, 429]);
    expect((await t.http().get('/api/v1/auth/me').set(bearer(tb))).status).toBe(200);
  });
});
