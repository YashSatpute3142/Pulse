// INTEGRATION tests: /users endpoints against the real Express app and REAL MongoDB.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestApp, resetDb, registerUser, bearer, cookieValue, mongoose } from '../helpers/app.js';
import { Friendship } from '../../src/models/Friendship.js';
import { RefreshToken } from '../../src/models/RefreshToken.js';
import { User } from '../../src/models/User.js';
import { pairKey } from '../../src/utils/ids.js';
import { events, EVENTS } from '../../src/utils/events.js';

let t;
const http = () => t.http();
const U = '/api/v1/users';
beforeAll(async () => { t = await startTestApp(); });
afterAll(async () => { await mongoose.connection.dropDatabase(); await t.stop(); });
beforeEach(resetDb);

const friendship = (x, y, over) => { const [userA, userB] = pairKey(x, y); return Friendship.create({ userA, userB, requestedBy: x, ...over }); };

describe('auth required', () => {
  it.each([['get', `${U}/search?q=a`], ['get', `${U}/507f1f77bcf86cd799439011`], ['patch', `${U}/me`], ['patch', `${U}/me/settings`], ['post', `${U}/me/password`]])('%s %s => 401', async (m, p) => {
    const res = await http()[m](p).send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('GET /users/search', () => {
  it('prefix-matches username and displayName case-insensitively, excludes self, max 20, public fields only', async () => {
    const me = await registerUser(http, { username: 'zed_me', displayName: 'Zed Me' });
    await registerUser(http, { username: 'zed_two', displayName: 'Someone' });
    await registerUser(http, { username: 'other', displayName: 'Zedra Q' });
    await registerUser(http, { username: 'nomatch', displayName: 'Nope' });
    const res = await http().get(`${U}/search?q=ZED`).set(bearer(me.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.map((u) => u.username).sort()).toEqual(['other', 'zed_two']);
    for (const u of res.body.data) {
      expect(Object.keys(u).sort()).toEqual(['avatarUrl', 'bio', 'createdAt', 'displayName', 'id', 'username']);
    }
  });
  it('does not match mid-string and treats regex characters literally', async () => {
    const me = await registerUser(http, { username: 'reg_me' });
    await registerUser(http, { username: 'abcdef' });
    expect((await http().get(`${U}/search?q=cde`).set(bearer(me.accessToken))).body.data).toEqual([]);
    expect((await http().get(`${U}/search?q=${encodeURIComponent('.*')}`).set(bearer(me.accessToken))).body.data).toEqual([]);
    expect((await http().get(`${U}/search?q=${encodeURIComponent('(')}`).set(bearer(me.accessToken))).status).toBe(200);
  });
  it('empty q returns []; q longer than 40 is a validation error', async () => {
    const me = await registerUser(http);
    expect((await http().get(`${U}/search?q=`).set(bearer(me.accessToken))).body.data).toEqual([]);
    expect((await http().get(`${U}/search`).set(bearer(me.accessToken))).body.data).toEqual([]);
    expect((await http().get(`${U}/search?q=${'a'.repeat(41)}`).set(bearer(me.accessToken))).status).toBe(400);
  });
  it('caps results at 20', async () => {
    const me = await registerUser(http, { username: 'cap_me' });
    await User.insertMany(Array.from({ length: 25 }, (_, i) => ({ username: `bulk${i}`, email: `bulk${i}@example.com`, passwordHash: 'x', displayName: `Bulk ${i}` })));
    const res = await http().get(`${U}/search?q=bulk`).set(bearer(me.accessToken));
    expect(res.body.data).toHaveLength(20);
  });
  it('excludes users who blocked me, and disabled users', async () => {
    const me = await registerUser(http, { username: 'sx_me' });
    const blocker = await registerUser(http, { username: 'sx_blocker' });
    const blocked = await registerUser(http, { username: 'sx_blocked' });
    const off = await registerUser(http, { username: 'sx_off' });
    await friendship(blocker.user.id, me.user.id, { status: 'blocked', blockedBy: blocker.user.id });
    await friendship(me.user.id, blocked.user.id, { status: 'blocked', blockedBy: me.user.id });
    await User.updateOne({ _id: off.user.id }, { disabledAt: new Date() });
    const names = (await http().get(`${U}/search?q=sx_`).set(bearer(me.accessToken))).body.data.map((u) => u.username);
    expect(names).toEqual(['sx_blocked']); // contract: only blockers are hidden
  });
});

describe('GET /users/:id', () => {
  it('returns the public profile with the friendship state', async () => {
    const me = await registerUser(http);
    const other = await registerUser(http, { displayName: 'Other P' });
    const get = async () => (await http().get(`${U}/${other.user.id}`).set(bearer(me.accessToken)));
    let res = await get();
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: other.user.id, displayName: 'Other P', friendship: 'none' });
    expect(res.body.data.email).toBeUndefined();
    expect(res.body.data.settings).toBeUndefined();

    const f = await friendship(me.user.id, other.user.id);
    expect((await get()).body.data.friendship).toBe('pending_out');
    await Friendship.updateOne({ _id: f._id }, { requestedBy: other.user.id });
    expect((await get()).body.data.friendship).toBe('pending_in');
    await Friendship.updateOne({ _id: f._id }, { status: 'accepted' });
    expect((await get()).body.data.friendship).toBe('friends');
    await Friendship.updateOne({ _id: f._id }, { status: 'blocked', blockedBy: me.user.id });
    expect((await get()).body.data.friendship).toBe('blocked');
  });
  it('404 for unknown, disabled, or users who blocked me; 400-style 404 shape for malformed ids', async () => {
    const me = await registerUser(http);
    const blocker = await registerUser(http);
    await friendship(blocker.user.id, me.user.id, { status: 'blocked', blockedBy: blocker.user.id });
    const off = await registerUser(http);
    await User.updateOne({ _id: off.user.id }, { disabledAt: new Date() });
    for (const id of ['507f1f77bcf86cd799439011', blocker.user.id, off.user.id]) {
      const res = await http().get(`${U}/${id}`).set(bearer(me.accessToken));
      expect(res.status, id).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
    const bad = await http().get(`${U}/not-an-id`).set(bearer(me.accessToken));
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH /users/me', () => {
  it('updates displayName/bio/avatarUrl and keeps displayNameLower (search) in sync', async () => {
    const me = await registerUser(http);
    const res = await http().patch(`${U}/me`).set(bearer(me.accessToken)).send({ displayName: ' New Name ', bio: 'hello', avatarUrl: 'https://res.cloudinary.com/x/a.png' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ displayName: 'New Name', bio: 'hello', avatarUrl: 'https://res.cloudinary.com/x/a.png', email: me.payload.email });
    expect((await User.findById(me.user.id).lean()).displayNameLower).toBe('new name');
    const other = await registerUser(http);
    expect((await http().get(`${U}/search?q=new%20n`).set(bearer(other.accessToken))).body.data.map((u) => u.id)).toEqual([me.user.id]);
    const cleared = await http().patch(`${U}/me`).set(bearer(me.accessToken)).send({ avatarUrl: null });
    expect(cleared.body.data.avatarUrl).toBeNull();
  });
  it.each([
    ['empty body', {}],
    ['unknown field (mass assignment)', { displayName: 'ok', tokenVersion: 99 }],
    ['email change not allowed in v1', { email: 'new@example.com' }],
    ['bio too long', { bio: 'b'.repeat(161) }],
    ['displayName too long', { displayName: 'n'.repeat(41) }],
    ['http avatar', { avatarUrl: 'http://x.example/a.png' }],
    ['javascript avatar', { avatarUrl: 'javascript:alert(1)' }],
  ])('400 VALIDATION_ERROR: %s', async (_n, body) => {
    const me = await registerUser(http);
    const res = await http().patch(`${U}/me`).set(bearer(me.accessToken)).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect((await User.findById(me.user.id).lean()).tokenVersion).toBe(0);
  });
});

describe('PATCH /users/me/settings', () => {
  it('partial update returns Me with merged settings (what useUpdateSettings sends: { theme })', async () => {
    const me = await registerUser(http);
    let res = await http().patch(`${U}/me/settings`).set(bearer(me.accessToken)).send({ theme: 'dark' });
    expect(res.status).toBe(200);
    expect(res.body.data.settings).toEqual({ theme: 'dark', activityVisibility: 'friends', showPresence: true, showReadReceipts: true });
    res = await http().patch(`${U}/me/settings`).set(bearer(me.accessToken)).send({ activityVisibility: 'nobody', showPresence: false });
    expect(res.body.data.settings).toEqual({ theme: 'dark', activityVisibility: 'nobody', showPresence: false, showReadReceipts: true });
    const fresh = await http().get('/api/v1/auth/me').set(bearer(me.accessToken));
    expect(fresh.body.data.settings.theme).toBe('dark'); // persisted
  });
  it.each([
    [{ theme: 'purple' }], [{ activityVisibility: 'public' }], [{ showPresence: 'yes' }], [{}], [{ theme: 'dark', extra: 1 }],
  ])('400 for invalid settings %j', async (body) => {
    const me = await registerUser(http);
    const res = await http().patch(`${U}/me/settings`).set(bearer(me.accessToken)).send(body);
    expect(res.status).toBe(400);
  });
});

describe('POST /users/me/password', () => {
  it('changes the password, kills old access tokens, revokes OTHER sessions but keeps the caller refreshable', async () => {
    const me = await registerUser(http);
    const second = await http().post('/api/v1/auth/login').send({ identifier: me.payload.email, password: me.payload.password });
    const otherDeviceRt = cookieValue(second.headers['set-cookie']);

    let emitted = null;
    const on = (e) => { emitted = e; };
    events.on(EVENTS.SESSION_REVOKED, on);
    const res = await http().post(`${U}/me/password`).set(bearer(me.accessToken)).set('Cookie', `pulse_rt=${me.rt}`)
      .send({ currentPassword: me.payload.password, newPassword: 'a brand new password' });
    events.off(EVENTS.SESSION_REVOKED, on);
    expect(res.status).toBe(204);
    expect(emitted).toEqual({ userId: me.user.id });

    expect((await http().get('/api/v1/auth/me').set(bearer(me.accessToken))).status).toBe(401); // old access token dead
    expect((await http().post('/api/v1/auth/refresh').set('Cookie', `pulse_rt=${otherDeviceRt}`)).status).toBe(401); // other device logged out
    const keep = await http().post('/api/v1/auth/refresh').set('Cookie', `pulse_rt=${me.rt}`); // this device carries on
    expect(keep.status).toBe(200);
    expect((await http().get('/api/v1/auth/me').set(bearer(keep.body.data.accessToken))).status).toBe(200); // new token has new tokenVersion

    expect((await http().post('/api/v1/auth/login').send({ identifier: me.payload.email, password: me.payload.password })).status).toBe(401);
    expect((await http().post('/api/v1/auth/login').send({ identifier: me.payload.email, password: 'a brand new password' })).status).toBe(200);
    expect(await RefreshToken.countDocuments({ userId: me.user.id, revokedAt: null })).toBeGreaterThan(0);
  });
  it('wrong current password => 400 VALIDATION_ERROR and nothing changes', async () => {
    const me = await registerUser(http);
    const res = await http().post(`${U}/me/password`).set(bearer(me.accessToken)).send({ currentPassword: 'not right at all', newPassword: 'a brand new password' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields.currentPassword).toBeTruthy();
    expect((await http().get('/api/v1/auth/me').set(bearer(me.accessToken))).status).toBe(200);
  });
  it('rejects weak/same new passwords', async () => {
    const me = await registerUser(http);
    for (const newPassword of ['short', me.payload.password, 'x'.repeat(73)]) {
      const res = await http().post(`${U}/me/password`).set(bearer(me.accessToken)).send({ currentPassword: me.payload.password, newPassword });
      expect(res.status, newPassword).toBe(400);
    }
  });
  it('blocks cross-origin cookie requests (CSRF guard)', async () => {
    const me = await registerUser(http);
    const res = await http().post(`${U}/me/password`).set(bearer(me.accessToken)).set('Origin', 'https://evil.example')
      .send({ currentPassword: me.payload.password, newPassword: 'a brand new password' });
    expect(res.status).toBe(403);
  });
});
