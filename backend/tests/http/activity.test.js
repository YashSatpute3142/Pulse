// INTEGRATION (real MongoDB + Express). No mocks.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestApp, resetDb, registerUser, befriend, bearer, captureEvents, mongoose } from '../helpers/app.js';
import { Activity } from '../../src/models/Activity.js';
import { User } from '../../src/models/User.js';
import { EVENTS } from '../../src/utils/events.js';
import { setPresenceProvider } from '../../src/services/presence.service.js';

let t;
const http = () => t.http();
const A = '/api/v1/activity';
beforeAll(async () => { t = await startTestApp(); });
afterAll(async () => { setPresenceProvider(null); await mongoose.connection.dropDatabase(); await t.stop(); });
beforeEach(async () => { await resetDb(); setPresenceProvider(null); });
const put = (u, body) => http().put(`${A}/me`).set(bearer(u.accessToken)).send(body);
const feed = (u) => http().get(`${A}/feed`).set(bearer(u.accessToken));

describe('my activity', () => {
  it('starts as null; PUT sets it with the contract shape; PUT replaces; DELETE clears (idempotent)', async () => {
    const u = await registerUser(http);
    expect((await http().get(`${A}/me`).set(bearer(u.accessToken))).body).toEqual({ data: null });
    const r = await put(u, { type: 'studying', label: '  Organic chemistry ' });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ userId: u.user.id, type: 'studying', label: 'Organic chemistry', visibility: 'friends', expiresAt: null });
    expect(r.body.data.startedAt).toBeTruthy();
    expect((await put(u, { type: 'coding' })).body.data).toMatchObject({ type: 'coding', label: '' });
    expect(await Activity.countDocuments({ userId: u.user.id })).toBe(1);
    expect((await http().get(`${A}/me`).set(bearer(u.accessToken))).body.data.type).toBe('coding');
    expect((await http().delete(`${A}/me`).set(bearer(u.accessToken))).status).toBe(204);
    expect((await http().delete(`${A}/me`).set(bearer(u.accessToken))).status).toBe(204);
    expect((await http().get(`${A}/me`).set(bearer(u.accessToken))).body.data).toBeNull();
  });

  it('visibility defaults to the user setting; explicit visibility wins', async () => {
    const u = await registerUser(http);
    await User.updateOne({ _id: u.user.id }, { 'settings.activityVisibility': 'everyone' });
    expect((await put(u, { type: 'music' })).body.data.visibility).toBe('everyone');
    expect((await put(u, { type: 'music', visibility: 'nobody' })).body.data.visibility).toBe('nobody');
  });

  it('validates input strictly', async () => {
    const u = await registerUser(http);
    for (const body of [{}, { type: 'napping' }, { type: 'coding', label: 'x'.repeat(61) }, { type: 'coding', visibility: 'public' },
      { type: 'coding', expiresInMin: 0 }, { type: 'coding', expiresInMin: 1441 }, { type: 'coding', expiresInMin: 1.5 }, { type: 'coding', extra: 1 }]) {
      expect((await put(u, body)).status).toBe(400);
    }
    expect((await http().put(`${A}/me`).send({ type: 'coding' })).status).toBe(401);
    expect((await http().get(`${A}/feed`)).status).toBe(401);
  });

  it('expiresInMin sets expiresAt; an expired activity is hidden immediately (before the TTL job runs)', async () => {
    const u = await registerUser(http);
    const r = await put(u, { type: 'break', expiresInMin: 30 });
    const mins = (new Date(r.body.data.expiresAt) - Date.now()) / 60000;
    expect(mins).toBeGreaterThan(29); expect(mins).toBeLessThan(31);
    await Activity.updateOne({ userId: u.user.id }, { expiresAt: new Date(Date.now() - 1000) });
    expect((await http().get(`${A}/me`).set(bearer(u.accessToken))).body.data).toBeNull();
  });

  it('emits activity:changed on set and on clear (once), for the WS layer', async () => {
    const u = await registerUser(http);
    const ev = captureEvents(EVENTS.ACTIVITY_CHANGED);
    await put(u, { type: 'gaming', label: 'Chess' });
    await http().delete(`${A}/me`).set(bearer(u.accessToken));
    await http().delete(`${A}/me`).set(bearer(u.accessToken)); // nothing to clear: no event
    ev.stop();
    expect(ev.got).toHaveLength(2);
    expect(ev.got[0]).toMatchObject({ userId: u.user.id, activity: { type: 'gaming', label: 'Chess' } });
    expect(ev.got[1]).toEqual({ userId: u.user.id, activity: null });
  });
});

describe('GET /activity/feed', () => {
  it('shows friends only, respects visibility, hides expired and disabled users, and orders newest first', async () => {
    const [me, f1, f2, f3, f4, stranger, f5] = await Promise.all(Array.from({ length: 7 }, () => registerUser(http)));
    for (const f of [f1, f2, f3, f4, f5]) await befriend(http, me, f);
    await put(f1, { type: 'studying', label: 'Chem', visibility: 'friends' });
    await put(f2, { type: 'coding', visibility: 'everyone' });
    await put(f3, { type: 'gaming', visibility: 'nobody' });
    await put(f4, { type: 'music', expiresInMin: 5 });
    await put(stranger, { type: 'working', visibility: 'everyone' });
    await put(f5, { type: 'break' });
    await Activity.updateOne({ userId: f4.user.id }, { expiresAt: new Date(Date.now() - 1000) });
    await User.updateOne({ _id: f5.user.id }, { disabledAt: new Date() });
    const r = await feed(me);
    expect(r.status).toBe(200);
    expect(r.body.data.map((x) => x.user.username)).toEqual([f2.user.username, f1.user.username]); // f2 was set last
    expect(r.body.data[1]).toMatchObject({ activity: { type: 'studying', label: 'Chem', userId: f1.user.id }, presence: 'offline' });
    expect(r.body.data[1].user).not.toHaveProperty('email');
    expect((await feed(stranger)).body.data).toEqual([]);
  });

  it('presence comes from the registered provider; showPresence=false always reads offline', async () => {
    const [me, a, b] = await Promise.all([registerUser(http), registerUser(http), registerUser(http)]);
    await befriend(http, me, a); await befriend(http, me, b);
    await put(a, { type: 'coding' }); await put(b, { type: 'coding' });
    await User.updateOne({ _id: b.user.id }, { 'settings.showPresence': false });
    setPresenceProvider(async (ids) => new Map(ids.map((id) => [id, id === a.user.id ? 'away' : 'online'])));
    const byUser = Object.fromEntries((await feed(me)).body.data.map((x) => [x.user.id, x.presence]));
    expect(byUser).toEqual({ [a.user.id]: 'away', [b.user.id]: 'offline' });
  });

  it('unfriending removes the person from the feed', async () => {
    const [me, f] = await Promise.all([registerUser(http), registerUser(http)]);
    await befriend(http, me, f);
    await put(f, { type: 'coding' });
    expect((await feed(me)).body.data).toHaveLength(1);
    await http().delete(`/api/v1/friends/${f.user.id}`).set(bearer(me.accessToken));
    expect((await feed(me)).body.data).toHaveLength(0);
  });
});
