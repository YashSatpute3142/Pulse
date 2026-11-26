import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { registerUser, befriend, makeDm, makeGroup, bearer } from '../helpers/app.js';
import { startWsApp, connect, until } from './wsHelpers.js';
import { User } from '../../src/models/User.js';
import { getPresence, recordLastSeen } from '../../src/services/presence.service.js';

const GRACE = 300;
let ctx;
const mk = async () => registerUser(ctx.http);
const updates = (c, userId) => c.ofType('PRESENCE_UPDATE').filter((f) => f.payload.userId === userId).map((f) => f.payload);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => { ctx = await startWsApp({ presenceGraceMs: GRACE, typingExpireMs: 400 }); });
afterAll(async () => { await ctx.stop(); });

describe('presence broadcast (protocol 8)', () => {
  it('a friend is told when a user comes online; strangers and the user themselves are not', async () => {
    const a = await mk(); const b = await mk(); const stranger = await mk();
    await befriend(ctx.http, a, b);
    const bc = await connect(ctx, b); const sc = await connect(ctx, stranger);
    const p = bc.nextOf('PRESENCE_UPDATE');
    const ac = await connect(ctx, a);
    expect((await p).payload).toEqual({ userId: a.user.id, status: 'online' });
    await pause(200);
    expect(sc.ofType('PRESENCE_UPDATE')).toHaveLength(0);
    expect(updates(ac, a.user.id)).toHaveLength(0);
  });

  it('members of a shared group who are not friends see each other (conversation rooms)', async () => {
    const owner = await mk(); const e = await mk(); const f = await mk();
    await befriend(ctx.http, owner, e); await befriend(ctx.http, owner, f);
    await makeGroup(ctx.http, owner, [e, f], 'Study');
    const fc = await connect(ctx, f);
    const p = fc.nextOf('PRESENCE_UPDATE');
    await connect(ctx, e);
    expect((await p).payload).toEqual({ userId: e.user.id, status: 'online' });
  });

  it('a second tab does not announce again', async () => {
    const a = await mk(); const b = await mk(); await befriend(ctx.http, a, b);
    const bc = await connect(ctx, b); await connect(ctx, a);
    await until(() => updates(bc, a.user.id).length === 1);
    await connect(ctx, a);
    await pause(250);
    expect(updates(bc, a.user.id)).toHaveLength(1);
  });

  it('USER_STATUS away is broadcast; any real user event brings the user back online; PING does not', async () => {
    const a = await mk(); const b = await mk(); await befriend(ctx.http, a, b);
    const bc = await connect(ctx, b); const ac = await connect(ctx, a);
    await until(() => updates(bc, a.user.id).length === 1);
    expect((await ac.request('USER_STATUS', { status: 'away' })).type).toBe('ACK');
    await until(() => updates(bc, a.user.id).length === 2);
    expect(updates(bc, a.user.id)[1]).toEqual({ userId: a.user.id, status: 'away' });
    ac.frame('PING'); await pause(200);
    expect(updates(bc, a.user.id)).toHaveLength(2);
    await ac.request('REGISTER', {});
    await until(() => updates(bc, a.user.id).length === 3);
    expect(updates(bc, a.user.id)[2].status).toBe('online');
  });

  it('with two tabs the user is online if any tab is, and away only when all are', async () => {
    const a = await mk(); const b = await mk(); await befriend(ctx.http, a, b);
    const bc = await connect(ctx, b); const t1 = await connect(ctx, a); const t2 = await connect(ctx, a);
    await until(() => updates(bc, a.user.id).length === 1);
    await t1.request('USER_STATUS', { status: 'away' }); await pause(250);
    expect(updates(bc, a.user.id)).toHaveLength(1); // t2 is still online
    await t2.request('USER_STATUS', { status: 'away' });
    await until(() => updates(bc, a.user.id).length === 2);
    expect(updates(bc, a.user.id)[1].status).toBe('away');
  });

  it('rejects an invalid status', async () => {
    const a = await mk(); const ac = await connect(ctx, a);
    expect((await ac.request('USER_STATUS', { status: 'offline' })).payload.code).toBe('VALIDATION_ERROR');
    expect((await ac.request('USER_STATUS', { status: 'busy' })).payload.code).toBe('VALIDATION_ERROR');
  });
});

describe('going offline: 20 s grace (shortened to 300 ms here) and lastSeenAt', () => {
  it('offline is sent only after the grace period, with lastSeenAt, and lastSeenAt is saved', async () => {
    const a = await mk(); const b = await mk(); await befriend(ctx.http, a, b);
    const bc = await connect(ctx, b); const ac = await connect(ctx, a);
    await until(() => updates(bc, a.user.id).length === 1);
    expect((await User.findById(a.user.id).lean()).lastSeenAt).toBeNull();
    const closedAt = Date.now();
    ac.ws.close(); await ac.closed();
    await pause(GRACE / 2);
    expect(updates(bc, a.user.id)).toHaveLength(1); // still inside the grace window
    await until(() => updates(bc, a.user.id).length === 2, 3000);
    const off = updates(bc, a.user.id)[1];
    expect(off).toMatchObject({ userId: a.user.id, status: 'offline' });
    expect(Math.abs(new Date(off.lastSeenAt).getTime() - closedAt)).toBeLessThan(3000);
    const saved = (await User.findById(a.user.id).lean()).lastSeenAt;
    expect(saved.toISOString()).toBe(off.lastSeenAt);
  });

  it('reconnecting inside the grace window produces no offline and no second online', async () => {
    const a = await mk(); const b = await mk(); await befriend(ctx.http, a, b);
    const bc = await connect(ctx, b); const a1 = await connect(ctx, a);
    await until(() => updates(bc, a.user.id).length === 1);
    a1.ws.close(); await a1.closed();
    await pause(100);
    await connect(ctx, a);
    await pause(GRACE + 250);
    expect(updates(bc, a.user.id)).toHaveLength(1);
    expect((await User.findById(a.user.id).lean()).lastSeenAt).toBeNull();
  });

  it('closing one of two tabs keeps the user online', async () => {
    const a = await mk(); const b = await mk(); await befriend(ctx.http, a, b);
    const bc = await connect(ctx, b); const t1 = await connect(ctx, a); await connect(ctx, a);
    await until(() => updates(bc, a.user.id).length === 1);
    t1.ws.close(); await t1.closed();
    await pause(GRACE + 250);
    expect(updates(bc, a.user.id)).toHaveLength(1);
    expect((await getPresence([a.user.id])).get(a.user.id)).toBe('online');
  });

  it('a non-friend group member still gets the offline update after the user\'s rooms are gone', async () => {
    const owner = await mk(); const e = await mk(); const f = await mk();
    await befriend(ctx.http, owner, e); await befriend(ctx.http, owner, f);
    await makeGroup(ctx.http, owner, [e, f], 'Crew');
    const fc = await connect(ctx, f); const ec = await connect(ctx, e);
    await until(() => updates(fc, e.user.id).length === 1);
    ec.ws.close();
    await until(() => updates(fc, e.user.id).length === 2, 3000);
    expect(updates(fc, e.user.id)[1].status).toBe('offline');
  });

  it('presence.service reports online while connected and offline after the grace period', async () => {
    const a = await mk(); const ac = await connect(ctx, a);
    expect((await getPresence([a.user.id])).get(a.user.id)).toBe('online');
    ac.ws.close(); await ac.closed();
    expect(await until(async () => (await getPresence([a.user.id])).get(a.user.id) === 'offline', 3000)).toBe(true);
  });

  it('recordLastSeen never moves lastSeenAt backwards', async () => {
    const a = await mk();
    const t1 = new Date('2026-01-02T00:00:00Z'); const t0 = new Date('2026-01-01T00:00:00Z');
    await recordLastSeen(a.user.id, t1); await recordLastSeen(a.user.id, t0);
    expect((await User.findById(a.user.id).lean()).lastSeenAt.toISOString()).toBe(t1.toISOString());
  });
});

describe('showPresence=false and the REGISTER snapshot', () => {
  it('a user who hides presence is never announced, and is offline for the service', async () => {
    const a = await mk(); const b = await mk(); await befriend(ctx.http, a, b);
    await ctx.http().patch('/api/v1/users/me/settings').set(bearer(a.accessToken)).send({ showPresence: false });
    const bc = await connect(ctx, b); const ac = await connect(ctx, a);
    await pause(250);
    expect(updates(bc, a.user.id)).toHaveLength(0);
    expect((await getPresence([a.user.id])).get(a.user.id)).toBe('offline');
    await ac.request('USER_STATUS', { status: 'away' }); await pause(150);
    expect(updates(bc, a.user.id)).toHaveLength(0);
    expect((await bc.request('REGISTER', {})).payload.data.presence).toEqual({});
    ac.ws.close(); await pause(GRACE + 300);
    expect(updates(bc, a.user.id)).toHaveLength(0);
    expect((await User.findById(a.user.id).lean()).lastSeenAt).toBeTruthy(); // still saved
  });

  it('REGISTER returns the visible presence of friends and conversation members, online and away only', async () => {
    const me = await mk(); const online = await mk(); const away = await mk(); const offline = await mk(); const stranger = await mk();
    for (const u of [online, away, offline]) await befriend(ctx.http, me, u);
    const oc = await connect(ctx, online); const wc = await connect(ctx, away); await connect(ctx, stranger);
    await wc.request('USER_STATUS', { status: 'away' });
    const mc = await connect(ctx, me);
    const r = await mc.request('REGISTER', {});
    expect(r.payload.data.presence).toEqual({ [online.user.id]: { status: 'online' }, [away.user.id]: { status: 'away' } });
    expect(oc.ws.readyState).toBe(1);
  });
});

describe('typing (protocol 8)', () => {
  let alice; let bob; let dm; let a1; let a2; let b1; let c1; let carol;
  beforeAll(async () => {
    alice = await mk(); bob = await mk(); carol = await mk();
    await befriend(ctx.http, alice, bob); dm = await makeDm(ctx.http, alice, bob);
    a1 = await connect(ctx, alice); a2 = await connect(ctx, alice); b1 = await connect(ctx, bob); c1 = await connect(ctx, carol);
  });
  const typing = (c) => c.ofType('TYPING_UPDATE').map((f) => f.payload);

  it('TYPING_START reaches the other member, not the typist\'s own tabs, and gets no reply', async () => {
    const p = b1.nextOf('TYPING_UPDATE');
    const errs = a1.ofType('ERROR').length;
    a1.frame('TYPING_START', { conversationId: dm.id });
    expect((await p).payload).toEqual({ conversationId: dm.id, userId: alice.user.id, typing: true });
    await pause(150);
    expect(typing(a2)).toHaveLength(0);
    expect(a1.ofType('ERROR').length).toBe(errs);
  });

  it('TYPING_STOP relays typing:false', async () => {
    const p = b1.nextOf('TYPING_UPDATE');
    a1.frame('TYPING_STOP', { conversationId: dm.id });
    expect((await p).payload).toMatchObject({ userId: alice.user.id, typing: false });
  });

  it('auto-stops after the expiry (400 ms here, 5 s in production)', async () => {
    await pause(2100); // clear the 2 s per-conversation gap
    const p = b1.nextOf('TYPING_UPDATE');
    a1.frame('TYPING_START', { conversationId: dm.id });
    expect((await p).payload.typing).toBe(true);
    const off = await b1.nextOf('TYPING_UPDATE', 2000);
    expect(off.payload).toMatchObject({ userId: alice.user.id, typing: false });
  });

  it('STARTs inside the 2 s gap are not relayed again but keep the timer alive', async () => {
    await pause(2100);
    const before = typing(b1).length;
    a1.frame('TYPING_START', { conversationId: dm.id });
    await until(() => typing(b1).length === before + 1);
    await pause(250); a1.frame('TYPING_START', { conversationId: dm.id }); // re-arms: would have expired at 400 ms
    await pause(300);
    expect(typing(b1).length).toBe(before + 1); // no second relay, and no auto-stop yet (550 ms after the first START)
    await until(() => typing(b1).length === before + 2, 2000);
    expect(typing(b1)[before + 1].typing).toBe(false);
  });

  it('a non-member typing in the conversation is ignored silently', async () => {
    const before = typing(b1).length; const errs = c1.ofType('ERROR').length;
    c1.frame('TYPING_START', { conversationId: dm.id });
    await pause(250);
    expect(typing(b1).length).toBe(before);
    expect(c1.ofType('ERROR').length).toBe(errs);
  });

  it('invalid typing payloads are dropped without an ERROR', async () => {
    const errs = a1.ofType('ERROR').length;
    a1.frame('TYPING_START', { conversationId: 'nope' }); a1.frame('TYPING_STOP', {});
    await pause(200);
    expect(a1.ofType('ERROR').length).toBe(errs);
  });

  it('typing stops immediately when the typist\'s last socket closes, but not while another tab remains', async () => {
    const x = await mk(); const y = await mk(); await befriend(ctx.http, x, y);
    const d = await makeDm(ctx.http, x, y);
    const yc = await connect(ctx, y); const x1 = await connect(ctx, x); const x2 = await connect(ctx, x);
    const ty = () => typing(yc);
    x1.frame('TYPING_START', { conversationId: d.id });
    await until(() => ty().length === 1);
    x2.ws.close(); await pause(100);
    expect(ty()).toHaveLength(1); // x1 is still connected
    x1.ws.close();
    await until(() => ty().length === 2, 1000); // well before the 400 ms expiry would matter: stop is explicit
    expect(ty()[1]).toMatchObject({ userId: x.user.id, typing: false });
  });

  it('a member removed from a group no longer reaches or hears typing', async () => {
    const owner = await mk(); const e = await mk(); const f = await mk();
    await befriend(ctx.http, owner, e); await befriend(ctx.http, owner, f);
    const g = await makeGroup(ctx.http, owner, [e, f], 'Typing');
    const ec = await connect(ctx, e); const fc = await connect(ctx, f);
    await ctx.http().delete(`/api/v1/conversations/${g.id}/members/${e.user.id}`).set(bearer(owner.accessToken));
    await ec.waitFor('CONVERSATION_REMOVED');
    ec.frame('TYPING_START', { conversationId: g.id });
    await pause(250);
    expect(typing(fc)).toHaveLength(0);
  });
});
