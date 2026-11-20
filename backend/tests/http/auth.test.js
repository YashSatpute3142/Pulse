// INTEGRATION tests: supertest -> real Express app -> REAL MongoDB. Nothing is mocked.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { startTestApp, resetDb, registerUser, sampleUser, cookieValue, bearer, mongoose } from '../helpers/app.js';
import { RefreshToken } from '../../src/models/RefreshToken.js';
import { User } from '../../src/models/User.js';
import { events, EVENTS } from '../../src/utils/events.js';
import { consumeTicket } from '../../src/services/ticket.service.js';

let t;
const http = () => t.http();
const A = '/api/v1/auth';
const refreshWith = (rt, headers = {}) => http().post(`${A}/refresh`).set('Cookie', `pulse_rt=${rt}`).set(headers);

beforeAll(async () => { t = await startTestApp(); });
afterAll(async () => { await mongoose.connection.dropDatabase(); await t.stop(); });
beforeEach(resetDb);

describe('POST /auth/register', () => {
  it('creates the user, returns { data: { user: Me, accessToken } } and sets the refresh cookie', async () => {
    const p = sampleUser({ username: 'Yash_1', email: 'Yash@Example.com', displayName: '  Yash  ' });
    const res = await http().post(`${A}/register`).send(p);
    expect(res.status).toBe(201);
    const { user, accessToken } = res.body.data;
    expect(user).toMatchObject({
      username: 'Yash_1', displayName: 'Yash', email: 'yash@example.com', avatarUrl: null, bio: '',
      settings: { theme: 'system', activityVisibility: 'friends', showPresence: true, showReadReceipts: true },
    });
    expect(user.id).toMatch(/^[a-f0-9]{24}$/);
    expect(new Date(user.createdAt).toISOString()).toBe(user.createdAt);
    expect(user.passwordHash).toBeUndefined();
    expect(user._id).toBeUndefined();
    expect(typeof accessToken).toBe('string');

    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/^pulse_rt=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    expect(cookie).toMatch(/SameSite=Lax/i); // development default
    expect(cookie).not.toMatch(/Secure/i);
    expect(cookie).toMatch(/Max-Age=604800/);
  });

  it('stores only a bcrypt hash of the password and only a hash of the refresh token', async () => {
    const { payload, rt, user } = await registerUser(http);
    const doc = await User.findById(user.id).select('+passwordHash').lean();
    expect(doc.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(doc.passwordHash).not.toContain(payload.password);
    const stored = await RefreshToken.find({ userId: user.id }).lean();
    expect(stored).toHaveLength(1);
    expect(stored[0].tokenHash).not.toBe(rt);
    expect(stored[0].tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored[0].familyId).toBeTruthy();
  });

  it('access token carries sub, tv, exp 15m, iss/aud', async () => {
    const { accessToken, user } = await registerUser(http);
    const c = jwt.decode(accessToken);
    expect(c.sub).toBe(user.id);
    expect(c.tv).toBe(0);
    expect(c.exp - c.iat).toBe(900);
    expect(c.iss).toBe('pulse');
  });

  it.each([
    ['short username', { username: 'ab' }, 'username'],
    ['bad username chars', { username: 'bad name!' }, 'username'],
    ['long username', { username: 'a'.repeat(25) }, 'username'],
    ['bad email', { email: 'nope' }, 'email'],
    ['short password', { password: 'short' }, 'password'],
    ['73-char password', { password: 'p'.repeat(73) }, 'password'],
    ['72 chars but >72 bytes', { password: 'é'.repeat(40) }, 'password'],
    ['empty displayName', { displayName: '   ' }, 'displayName'],
    ['41-char displayName', { displayName: 'n'.repeat(41) }, 'displayName'],
  ])('400 VALIDATION_ERROR with details.fields: %s', async (_n, over, field) => {
    const res = await http().post(`${A}/register`).send(sampleUser(over));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.fields[field]).toBeTruthy();
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('rejects a password equal to the username or the email', async () => {
    let res = await http().post(`${A}/register`).send(sampleUser({ username: 'samepass1', password: 'samepass1' }));
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields.password).toMatch(/cannot match/);
    res = await http().post(`${A}/register`).send(sampleUser({ email: 'long.address@example.com', password: 'LONG.address@example.com' }));
    expect(res.status).toBe(400);
  });

  it('accepts a 72-byte password (boundary)', async () => {
    const res = await http().post(`${A}/register`).send(sampleUser({ password: 'p'.repeat(72) }));
    expect(res.status).toBe(201);
  });

  it('409 CONFLICT for a duplicate username (case-insensitive) and for a duplicate email', async () => {
    const first = sampleUser({ username: 'Taken_Name', email: 'first@example.com' });
    expect((await http().post(`${A}/register`).send(first)).status).toBe(201);
    let res = await http().post(`${A}/register`).send(sampleUser({ username: 'taken_name' }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.details.fields.username).toBeTruthy();
    res = await http().post(`${A}/register`).send(sampleUser({ email: 'FIRST@example.com' }));
    expect(res.status).toBe(409);
    expect(res.body.error.details.fields.email).toBeTruthy();
  });

  it('race: 6 simultaneous registrations of the same username create exactly one account', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) =>
      http().post(`${A}/register`).send(sampleUser({ username: 'racer', email: `racer${i}@example.com` }))));
    const codes = results.map((r) => r.status).sort();
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(5);
    expect(await User.countDocuments({ usernameLower: 'racer' })).toBe(1);
  });

  it('400 on malformed JSON with the standard error shape', async () => {
    const res = await http().post(`${A}/register`).set('Content-Type', 'application/json').send('{"username":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('413 PAYLOAD_TOO_LARGE for oversized bodies', async () => {
    const res = await http().post(`${A}/register`).send({ ...sampleUser(), displayName: 'x'.repeat(200_000) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('POST /auth/login', () => {
  it('logs in by email and by username (case-insensitive) and sets a new cookie', async () => {
    const { payload } = await registerUser(http, { username: 'LoginUser', email: 'login@example.com' });
    for (const identifier of ['login@example.com', 'LOGIN@EXAMPLE.COM', 'loginuser', 'LoginUser']) {
      const res = await http().post(`${A}/login`).send({ identifier, password: payload.password });
      expect(res.status, identifier).toBe(200);
      expect(res.body.data.user.email).toBe('login@example.com');
      expect(res.body.data.accessToken).toBeTruthy();
      expect(cookieValue(res.headers['set-cookie'])).toBeTruthy();
    }
  });

  it('401 UNAUTHENTICATED with the same message for wrong password and unknown user (no enumeration)', async () => {
    const { payload } = await registerUser(http);
    const wrongPw = await http().post(`${A}/login`).send({ identifier: payload.email, password: 'wrong password!' });
    const unknown = await http().post(`${A}/login`).send({ identifier: 'ghost@example.com', password: 'wrong password!' });
    for (const r of [wrongPw, unknown]) {
      expect(r.status).toBe(401);
      expect(r.body.error.code).toBe('UNAUTHENTICATED');
      expect(r.headers['set-cookie']).toBeUndefined();
    }
    expect(wrongPw.body.error.message).toBe(unknown.body.error.message);
  });

  it('refuses disabled accounts', async () => {
    const { payload, user } = await registerUser(http);
    await User.updateOne({ _id: user.id }, { disabledAt: new Date() });
    const res = await http().post(`${A}/login`).send({ identifier: payload.email, password: payload.password });
    expect(res.status).toBe(401);
  });

  it('400 VALIDATION_ERROR with empty fields', async () => {
    const res = await http().post(`${A}/login`).send({ identifier: '', password: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields).toHaveProperty('identifier');
    expect(res.body.error.details.fields).toHaveProperty('password');
  });

  it('does not treat NoSQL operator objects as identifiers', async () => {
    await registerUser(http);
    const res = await http().post(`${A}/login`).send({ identifier: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(400);
  });
});

describe('POST /auth/refresh: rotation and reuse detection', () => {
  it('returns { user, accessToken } and rotates the cookie; the old token stops working', async () => {
    const { rt, user } = await registerUser(http);
    const res = await refreshWith(rt);
    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(user.id);
    expect(res.body.data.accessToken).toBeTruthy();
    const rt2 = cookieValue(res.headers['set-cookie']);
    expect(rt2).toBeTruthy();
    expect(rt2).not.toBe(rt);

    const docs = await RefreshToken.find({ userId: user.id }).sort({ createdAt: 1 }).lean();
    expect(docs).toHaveLength(2);
    expect(docs[0].revokedAt).toBeTruthy();
    expect(String(docs[0].replacedBy)).toBe(String(docs[1]._id));
    expect(docs[1].revokedAt).toBeNull();
    expect(docs[1].familyId).toBe(docs[0].familyId);

    expect((await refreshWith(rt2)).status).toBe(200); // the new one works
  });

  it('reusing a rotated token => 401 TOKEN_REUSED and the WHOLE family is revoked (even the newest token)', async () => {
    const { rt, user } = await registerUser(http);
    const rt2 = cookieValue((await refreshWith(rt)).headers['set-cookie']);
    const rt3 = cookieValue((await refreshWith(rt2)).headers['set-cookie']);

    const reuse = await refreshWith(rt); // attacker replays the oldest token
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('TOKEN_REUSED');
    expect(reuse.headers['set-cookie'][0]).toMatch(/pulse_rt=;/); // cookie cleared

    const legit = await refreshWith(rt3); // the legitimate holder is now logged out too
    expect(legit.status).toBe(401);
    expect(await RefreshToken.countDocuments({ userId: user.id, revokedAt: null })).toBe(0);
  });

  it('does not revoke other families (other devices) when one family is reused', async () => {
    const a = await registerUser(http);
    const second = await http().post(`${A}/login`).send({ identifier: a.payload.email, password: a.payload.password });
    const otherDevice = cookieValue(second.headers['set-cookie']);
    const r2 = cookieValue((await refreshWith(a.rt)).headers['set-cookie']);
    expect((await refreshWith(a.rt)).body.error.code).toBe('TOKEN_REUSED');
    expect(r2).toBeTruthy();
    expect((await refreshWith(otherDevice)).status).toBe(200);
  });

  it('race: two refreshes with the same token at once => exactly one succeeds', async () => {
    const { rt } = await registerUser(http);
    const [x, y] = await Promise.all([refreshWith(rt), refreshWith(rt)]);
    expect([x.status, y.status].sort()).toEqual([200, 401]);
  });

  it('401 UNAUTHENTICATED (not reuse) with no cookie, a garbage cookie, or an expired token', async () => {
    let res = await http().post(`${A}/refresh`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    res = await refreshWith('garbage');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');

    const { rt, user } = await registerUser(http);
    await RefreshToken.updateOne({ userId: user.id }, { expiresAt: new Date(Date.now() - 1000) });
    res = await refreshWith(rt);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('refuses (and revokes) when the account was disabled', async () => {
    const { rt, user } = await registerUser(http);
    await User.updateOne({ _id: user.id }, { disabledAt: new Date() });
    expect((await refreshWith(rt)).status).toBe(401);
    expect(await RefreshToken.countDocuments({ userId: user.id, revokedAt: null })).toBe(0);
  });
});

describe('POST /auth/logout', () => {
  it('204, clears the cookie, revokes the family, bumps tokenVersion and emits session:revoked for sockets', async () => {
    const { rt, user, accessToken } = await registerUser(http);
    let emitted;
    const on = (e) => { emitted = e; };
    events.on(EVENTS.SESSION_REVOKED, on);
    const res = await http().post(`${A}/logout`).set('Cookie', `pulse_rt=${rt}`);
    events.off(EVENTS.SESSION_REVOKED, on);
    expect(res.status).toBe(204);
    expect(res.headers['set-cookie'][0]).toMatch(/pulse_rt=;/);
    expect(emitted).toEqual({ userId: user.id });
    expect(await RefreshToken.countDocuments({ userId: user.id, revokedAt: null })).toBe(0);
    expect((await User.findById(user.id).lean()).tokenVersion).toBe(1);
    expect((await refreshWith(rt)).status).toBe(401);
    expect((await http().get(`${A}/me`).set(bearer(accessToken))).status).toBe(401); // old access token is dead
  });

  it('is idempotent: 204 without any cookie', async () => {
    expect((await http().post(`${A}/logout`)).status).toBe(204);
    expect((await http().post(`${A}/logout`).set('Cookie', 'pulse_rt=whatever')).status).toBe(204);
  });
});

describe('GET /auth/me and access-token checks', () => {
  it('returns Me for a valid token', async () => {
    const { accessToken, user } = await registerUser(http);
    const res = await http().get(`${A}/me`).set(bearer(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(user);
  });
  it('401 UNAUTHENTICATED: missing, malformed, wrong scheme, tampered, wrong secret, expired, none-alg', async () => {
    const { accessToken, user } = await registerUser(http);
    const claims = { tv: 0 };
    const opts = { subject: user.id, issuer: 'pulse', audience: 'pulse-api' };
    const cases = {
      missing: {},
      malformed: bearer('not.a.jwt'),
      scheme: { Authorization: `Basic ${accessToken}` },
      tampered: bearer(accessToken.slice(0, -2) + 'xx'),
      wrongSecret: bearer(jwt.sign(claims, 'some-other-secret-0123456789', opts)),
      refreshSecret: bearer(jwt.sign(claims, process.env.JWT_REFRESH_SECRET, opts)),
      expired: bearer(jwt.sign(claims, process.env.JWT_ACCESS_SECRET, { ...opts, expiresIn: -10 })),
      wrongAudience: bearer(jwt.sign(claims, process.env.JWT_ACCESS_SECRET, { ...opts, audience: 'other' })),
      noneAlg: bearer(`${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, tv: 0 })).toString('base64url')}.`),
    };
    for (const [name, h] of Object.entries(cases)) {
      const res = await http().get(`${A}/me`).set(h);
      expect(res.status, name).toBe(401);
      expect(res.body.error.code, name).toBe('UNAUTHENTICATED');
    }
  });
  it('rejects tokens of deleted or disabled users and of an older tokenVersion', async () => {
    const a = await registerUser(http);
    await User.updateOne({ _id: a.user.id }, { $inc: { tokenVersion: 1 } });
    expect((await http().get(`${A}/me`).set(bearer(a.accessToken))).status).toBe(401);
    const b = await registerUser(http);
    await User.updateOne({ _id: b.user.id }, { disabledAt: new Date() });
    expect((await http().get(`${A}/me`).set(bearer(b.accessToken))).status).toBe(401);
    const c = await registerUser(http);
    await User.deleteOne({ _id: c.user.id });
    expect((await http().get(`${A}/me`).set(bearer(c.accessToken))).status).toBe(401);
  });
});

describe('POST /auth/ws-ticket', () => {
  it('requires auth', async () => {
    expect((await http().post(`${A}/ws-ticket`)).status).toBe(401);
  });
  it('returns { ticket, expiresInSec: 30 }; the ticket resolves to this user exactly once (service Chat 04 will call)', async () => {
    const { accessToken, user } = await registerUser(http);
    const res = await http().post(`${A}/ws-ticket`).set(bearer(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.expiresInSec).toBe(30);
    expect(consumeTicket(res.body.data.ticket)).toEqual({ userId: user.id });
    expect(consumeTicket(res.body.data.ticket)).toBeNull();
  });
});

describe('CSRF / origin protection of cookie endpoints', () => {
  it('rejects refresh and logout from a non-allowlisted Origin (403 FORBIDDEN), without touching the session', async () => {
    const { rt } = await registerUser(http);
    for (const path of ['refresh', 'logout']) {
      const res = await http().post(`${A}/${path}`).set('Cookie', `pulse_rt=${rt}`).set('Origin', 'https://evil.example');
      expect(res.status, path).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    expect((await refreshWith(rt, { Origin: 'http://localhost:5173' })).status).toBe(200); // still valid, allowed origin works
  });
  it('rejects Sec-Fetch-Site: cross-site without Origin; allows same-site/absent', async () => {
    const { rt } = await registerUser(http);
    expect((await refreshWith(rt, { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
    expect((await refreshWith(rt, { 'Sec-Fetch-Site': 'same-origin' })).status).toBe(200);
  });
});

describe('CORS, headers, errors, health', () => {
  it('allows credentialed CORS only for CLIENT_ORIGINS', async () => {
    const ok = await http().options(`${A}/login`).set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'POST');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    const bad = await http().options(`${A}/login`).set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('sets security headers and hides x-powered-by', async () => {
    const res = await http().get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-request-id']).toBeTruthy();
  });
  it('unknown route => 404 NOT_FOUND in the standard error shape', async () => {
    const res = await http().get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
  });
  it('GET /health => ok with db up (no secrets); also under /api/v1', async () => {
    for (const p of ['/health', '/api/v1/health']) {
      const res = await http().get(p);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'ok', db: 'up' });
      expect(typeof res.body.uptime).toBe('number');
      expect(Object.keys(res.body).sort()).toEqual(['db', 'status', 'uptime']);
    }
  });
  it('GET /time is public and returns an ISO date', async () => {
    const res = await http().get('/api/v1/time');
    expect(res.status).toBe(200);
    expect(new Date(res.body.data.now).toISOString()).toBe(res.body.data.now);
  });
});
