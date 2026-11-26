import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { registerUser, befriend } from '../helpers/app.js';
import { startWsApp, startExtra, connect, until } from './wsHelpers.js';
import { FocusRoom } from '../../src/models/FocusRoom.js';

let ctx; let host; let member; let invited; let stranger; let h1; let h2; let m1; let i1; let s1;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const mk = () => registerUser(ctx.http);
const ofRoom = (c, type, roomId) => c.ofType(type).filter((f) => (f.payload.roomId ?? f.payload.room?.id) === roomId);
// The service allows 3 open rooms per host. Earlier tests leave rooms open, so close them directly in the database first (test setup, not behaviour under test).
const newRoom = async (over = {}) => {
  await FocusRoom.updateMany({ hostId: host.user.id, status: { $in: ['lobby', 'running'] } }, { $set: { status: 'cancelled' } });
  const r = await h1.request('ROOM_CREATE', { title: 'Deep work', durationSec: 1500, inviteUserIds: [member.user.id, invited.user.id], ...over });
  if (r.type !== 'ACK') throw new Error(`newRoom failed: ${JSON.stringify(r.payload)}`);
  return r.payload.data.room;
};

beforeAll(async () => {
  ctx = await startWsApp({ focusTickMs: 150, focusSweepEvery: 2 });
  [host, member, invited, stranger] = [await mk(), await mk(), await mk(), await mk()];
  for (const u of [member, invited]) await befriend(ctx.http, host, u);
  h1 = await connect(ctx, host); h2 = await connect(ctx, host); m1 = await connect(ctx, member); i1 = await connect(ctx, invited); s1 = await connect(ctx, stranger);
});
afterAll(async () => { await ctx.stop(); });

describe('ROOM_CREATE / ROOM_INVITE', () => {
  it('creates a lobby room hosted by the socket user and invites friends (ROOM_INVITED with the host)', async () => {
    const pm = m1.nextOf('ROOM_INVITED'); const pi = i1.nextOf('ROOM_INVITED');
    const r = await h1.request('ROOM_CREATE', { title: 'Deep work', durationSec: 1500, inviteUserIds: [member.user.id, invited.user.id], hostId: stranger.user.id });
    expect(r.type).toBe('ACK');
    const { room } = r.payload.data;
    expect(room).toMatchObject({ title: 'Deep work', hostId: host.user.id, durationSec: 1500, status: 'lobby', endsAt: null });
    expect(room.participants.map((p) => p.user.id)).toEqual([host.user.id]);
    for (const f of [await pm, await pi]) expect(f.payload).toMatchObject({ room: { id: room.id }, invitedBy: { id: host.user.id, username: host.user.username } });
    await pause(150);
    expect(s1.ofType('ROOM_INVITED')).toHaveLength(0);
    expect(JSON.stringify(m1.ofType('ROOM_INVITED')[0].payload.invitedBy)).not.toContain('@'); // no email leaks
  });
  it('rejects bad input and enforces service rules', async () => {
    expect((await h1.request('ROOM_CREATE', { title: '', durationSec: 1500 })).payload.code).toBe('VALIDATION_ERROR');
    expect((await h1.request('ROOM_CREATE', { title: 'x', durationSec: 10 })).payload.code).toBe('VALIDATION_ERROR');
    expect((await h1.request('ROOM_CREATE', { title: 'x', durationSec: 1500, inviteUserIds: [stranger.user.id] })).payload.code).toBe('FORBIDDEN'); // friends only
    expect((await h1.request('ROOM_CREATE', { title: 'x', durationSec: 1500, inviteUserIds: ['nope'] })).payload.code).toBe('VALIDATION_ERROR');
  });
  it('limits open hosted rooms (service rule, 3)', async () => {
    const lim = await mk(); const lc = await connect(ctx, lim);
    for (let i = 0; i < 3; i += 1) expect((await lc.request('ROOM_CREATE', { title: `r${i}`, durationSec: 600 })).type).toBe('ACK');
    expect((await lc.request('ROOM_CREATE', { title: 'r4', durationSec: 600 })).payload.code).toBe('CONFLICT');
  });
  it('ROOM_INVITE is host-only, friends-only; ROOM_STATE reaches participants, ROOM_INVITED the new invitee', async () => {
    const room = await newRoom({ inviteUserIds: [] });
    const extra = await mk(); await befriend(ctx.http, host, extra); const ec = await connect(ctx, extra);
    expect((await m1.request('ROOM_INVITE', { roomId: room.id, userIds: [extra.user.id] })).payload.code).toBe('FORBIDDEN');
    expect((await h1.request('ROOM_INVITE', { roomId: room.id, userIds: [stranger.user.id] })).payload.code).toBe('FORBIDDEN');
    const pe = ec.nextOf('ROOM_INVITED'); const ph = h2.nextOf('ROOM_STATE');
    expect((await h1.request('ROOM_INVITE', { roomId: room.id, userIds: [extra.user.id] })).type).toBe('ACK');
    expect((await pe).payload.room.id).toBe(room.id);
    expect((await ph).payload.room.invitedIds).toContain(extra.user.id);
  });
});

describe('ROOM_JOIN / ROOM_LEAVE / ROOM_MESSAGE', () => {
  let room;
  beforeAll(async () => { room = await newRoom(); });

  it('only the host and invited users may join; a stranger is refused and not placed in the room', async () => {
    const r = await s1.request('ROOM_JOIN', { roomId: room.id });
    expect(r.payload.code).toBe('FORBIDDEN');
    expect(ctx.wsServer.rooms.has(`focus:${room.id}`, ctx.wsServer.connections.socketsOf(stranger.user.id)[0])).toBe(false);
    expect((await s1.request('ROOM_JOIN', { roomId: 'a'.repeat(24) })).payload.code).toBe('NOT_FOUND');
  });
  it('the host joins; the ACK carries room + messages + serverNow (epoch ms) and the socket enters focus:<id>', async () => {
    const r = await h1.request('ROOM_JOIN', { roomId: room.id });
    expect(r.type).toBe('ACK');
    expect(Math.abs(r.payload.data.serverNow - Date.now())).toBeLessThan(5000);
    expect(r.payload.data.room.id).toBe(room.id);
    expect(Array.isArray(r.payload.data.messages)).toBe(true);
    expect(ctx.wsServer.rooms.size(`focus:${room.id}`)).toBe(1);
  });
  it('an invited user joins: participants get ROOM_PARTICIPANT_JOINED + the join line, the joiner\'s own socket does not (its ACK has them)', async () => {
    const ph = h1.nextOf('ROOM_PARTICIPANT_JOINED'); const pmsg = h1.nextOf('ROOM_MESSAGE_NEW');
    const r = await m1.request('ROOM_JOIN', { roomId: room.id });
    expect(r.payload.data.room.participants.map((p) => p.user.id).sort()).toEqual([host.user.id, member.user.id].sort());
    expect(r.payload.data.messages.some((m) => m.kind === 'join')).toBe(true);
    expect((await ph).payload).toMatchObject({ roomId: room.id, user: { id: member.user.id } });
    expect((await pmsg).payload.message).toMatchObject({ roomId: room.id, kind: 'join', senderId: member.user.id });
    await pause(150);
    expect(ofRoom(m1, 'ROOM_PARTICIPANT_JOINED', room.id)).toHaveLength(0);
  });
  it('joining again is idempotent: no second broadcast', async () => {
    const n = ofRoom(h1, 'ROOM_PARTICIPANT_JOINED', room.id).length;
    expect((await m1.request('ROOM_JOIN', { roomId: room.id })).type).toBe('ACK');
    await pause(200);
    expect(ofRoom(h1, 'ROOM_PARTICIPANT_JOINED', room.id)).toHaveLength(n);
  });
  it('ROOM_MESSAGE reaches every participant including the sender; invited-but-not-joined users cannot chat; text rules come from the service', async () => {
    const ph = h1.nextOf('ROOM_MESSAGE_NEW'); const pm = m1.nextOf('ROOM_MESSAGE_NEW'); const ph2 = h2.nextOf('ROOM_MESSAGE_NEW');
    const r = await m1.request('ROOM_MESSAGE', { roomId: room.id, text: 'focus time' });
    expect(r.payload.data.message).toMatchObject({ kind: 'text', text: 'focus time', senderId: member.user.id });
    for (const f of [await ph, await pm, await ph2]) expect(f.payload.message.id).toBe(r.payload.data.message.id);
    await pause(150);
    expect(i1.ofType('ROOM_MESSAGE_NEW').filter((f) => f.payload.message.text === 'focus time')).toHaveLength(0);
    expect((await i1.request('ROOM_MESSAGE', { roomId: room.id, text: 'hi' })).payload.code).toBe('FORBIDDEN');
    expect((await m1.request('ROOM_MESSAGE', { roomId: room.id, text: '   ' })).payload.code).toBe('VALIDATION_ERROR');
    expect((await m1.request('ROOM_MESSAGE', { roomId: room.id, text: 'x'.repeat(501) })).payload.code).toBe('VALIDATION_ERROR');
  });
  it('a member leaving tells the others (not themselves), and drops their sockets from focus:<id>', async () => {
    const ph = h1.nextOf('ROOM_PARTICIPANT_LEFT');
    expect((await m1.request('ROOM_LEAVE', { roomId: room.id })).type).toBe('ACK');
    expect((await ph).payload).toMatchObject({ roomId: room.id, user: { id: member.user.id } });
    expect(ofRoom(m1, 'ROOM_PARTICIPANT_LEFT', room.id)).toHaveLength(0);
    expect(ctx.wsServer.rooms.has(`focus:${room.id}`, ctx.wsServer.connections.socketsOf(member.user.id)[0])).toBe(false);
    expect((await m1.request('ROOM_MESSAGE', { roomId: room.id, text: 'ghost' })).payload.code).toBe('FORBIDDEN');
    expect((await m1.request('ROOM_LEAVE', { roomId: room.id })).type).toBe('ACK'); // idempotent
  });
  it('a participant can come back (re-join) and appears again', async () => {
    const r = await m1.request('ROOM_JOIN', { roomId: room.id });
    expect(r.payload.data.room.participants.map((p) => p.user.id)).toContain(member.user.id);
  });
  it('the host leaving a lobby cancels it: participants and invited users get ROOM_CANCELLED', async () => {
    const lobby = await newRoom();
    await h1.request('ROOM_JOIN', { roomId: lobby.id }); await m1.request('ROOM_JOIN', { roomId: lobby.id });
    const pm = m1.nextOf('ROOM_CANCELLED'); const pi = i1.nextOf('ROOM_CANCELLED');
    expect((await h1.request('ROOM_LEAVE', { roomId: lobby.id })).type).toBe('ACK');
    expect((await pm).payload).toEqual({ roomId: lobby.id }); expect((await pi).payload).toEqual({ roomId: lobby.id });
    expect((await FocusRoom.findById(lobby.id).lean()).status).toBe('cancelled');
    expect(ctx.wsServer.rooms.size(`focus:${lobby.id}`)).toBe(0);
  });
});

describe('ROOM_START, timer, completion (protocol 9)', () => {
  let room;
  beforeAll(async () => {
    room = await newRoom();
    await h1.request('ROOM_JOIN', { roomId: room.id }); await m1.request('ROOM_JOIN', { roomId: room.id });
  });

  it('only the host can start; the server sets endsAt = now + durationSec; everyone (sender included) gets state, timer and the start line', async () => {
    expect((await m1.request('ROOM_START', { roomId: room.id })).payload.code).toBe('FORBIDDEN');
    const ph = h1.nextOf('ROOM_STATE'); const pm = m1.nextOf('ROOM_STATE'); const pt = m1.nextOf('ROOM_TIMER_UPDATE'); const pl = m1.nextOf('ROOM_MESSAGE_NEW');
    const t0 = Date.now();
    const r = await h1.request('ROOM_START', { roomId: room.id });
    expect(r.type).toBe('ACK');
    const started = r.payload.data.room;
    expect(started.status).toBe('running');
    expect(new Date(started.endsAt).getTime() - new Date(started.startedAt).getTime()).toBe(1500 * 1000);
    expect(Math.abs(new Date(started.startedAt).getTime() - t0)).toBeLessThan(3000);
    for (const f of [await ph, await pm]) expect(f.payload.room.status).toBe('running');
    expect(typeof (await pm).payload.serverNow).toBe('number');
    expect(await pt).toMatchObject({ payload: { roomId: room.id, status: 'running', endsAt: started.endsAt } });
    expect((await pl).payload.message.kind).toBe('start');
    expect(ctx.wsServer.focusTimer.isArmed(room.id)).toBe(true);
  });
  it('starting twice is refused', async () => { expect((await h1.request('ROOM_START', { roomId: room.id })).payload.code).toBe('CONFLICT'); });
  it('ROOM_TIMER_UPDATE drift ticks reach sockets that joined the room, not people who merely hold an invitation', async () => {
    const before = ofRoom(m1, 'ROOM_TIMER_UPDATE', room.id).length;
    await pause(500);
    expect(ofRoom(m1, 'ROOM_TIMER_UPDATE', room.id).length).toBeGreaterThanOrEqual(before + 2);
    expect(ofRoom(i1, 'ROOM_TIMER_UPDATE', room.id)).toHaveLength(0);
  });
  it('a late joiner of a running room gets endsAt and status in the ACK', async () => {
    const r = await i1.request('ROOM_JOIN', { roomId: room.id });
    expect(r.payload.data.room).toMatchObject({ status: 'running' });
    expect(r.payload.data.room.endsAt).toBeTruthy();
    await i1.request('ROOM_LEAVE', { roomId: room.id });
  });
  it('at endsAt the server completes the room once: system line, ROOM_COMPLETED to participants and invited users, then the room is closed', async () => {
    // The service's minimum duration is 5 min, so the clock is moved in the database and the precise timer is re-armed for it.
    await FocusRoom.updateOne({ _id: room.id }, { $set: { endsAt: new Date(Date.now() + 700) } });
    ctx.wsServer.focusTimer.arm(room.id, new Date(Date.now() + 700));
    const ph = h1.nextOf('ROOM_COMPLETED'); const pm = m1.nextOf('ROOM_COMPLETED'); const pi = i1.nextOf('ROOM_COMPLETED');
    const hmsg = h1.nextOf('ROOM_MESSAGE_NEW');
    for (const f of [await ph, await pm, await pi]) expect(f.payload).toMatchObject({ roomId: room.id, durationSec: 1500 });
    expect(new Date((await ph).payload.completedAt).getTime()).toBeLessThanOrEqual(Date.now());
    expect((await hmsg).payload.message.kind).toBe('complete');
    expect((await FocusRoom.findById(room.id).lean()).status).toBe('completed');
    await pause(400);
    expect(ofRoom(h1, 'ROOM_COMPLETED', room.id)).toHaveLength(1); // never twice
    expect(ctx.wsServer.focusTimer.isArmed(room.id)).toBe(false);
    expect(ctx.wsServer.rooms.size(`focus:${room.id}`)).toBe(0);
    expect((await m1.request('ROOM_MESSAGE', { roomId: room.id, text: 'late' })).payload.code).toBe('CONFLICT');
    expect((await h1.request('ROOM_CANCEL', { roomId: room.id })).payload.code).toBe('CONFLICT'); // a finished room cannot be cancelled
  });
  it('a room whose timer was missed is completed by the periodic sweep', async () => {
    const r = await newRoom({ inviteUserIds: [] });
    await h1.request('ROOM_JOIN', { roomId: r.id });
    await h1.request('ROOM_START', { roomId: r.id });
    const done = h1.nextOf('ROOM_COMPLETED');
    await FocusRoom.updateOne({ _id: r.id }, { $set: { endsAt: new Date(Date.now() - 1000) } }); // overdue, but the 25 min timer is still armed
    expect((await done).payload.roomId).toBe(r.id);
    expect(ctx.wsServer.focusTimer.isArmed(r.id)).toBe(false);
  });
});

describe('ROOM_CANCEL', () => {
  it('host only; participants and invited users are told; the timer is disarmed; cancelling again is harmless', async () => {
    const room = await newRoom();
    await h1.request('ROOM_JOIN', { roomId: room.id }); await m1.request('ROOM_JOIN', { roomId: room.id });
    await h1.request('ROOM_START', { roomId: room.id });
    expect((await m1.request('ROOM_CANCEL', { roomId: room.id })).payload.code).toBe('FORBIDDEN');
    expect((await s1.request('ROOM_CANCEL', { roomId: room.id })).type).toBe('ERROR');
    const pm = m1.nextOf('ROOM_CANCELLED'); const pi = i1.nextOf('ROOM_CANCELLED'); const ph = h1.nextOf('ROOM_CANCELLED');
    expect((await h1.request('ROOM_CANCEL', { roomId: room.id })).type).toBe('ACK');
    for (const f of [await pm, await pi, await ph]) expect(f.payload).toEqual({ roomId: room.id });
    expect(ctx.wsServer.focusTimer.isArmed(room.id)).toBe(false);
    expect(ctx.wsServer.rooms.size(`focus:${room.id}`)).toBe(0);
    await pause(150);
    const n = ofRoom(h1, 'ROOM_CANCELLED', room.id).length;
    expect((await h1.request('ROOM_CANCEL', { roomId: room.id })).type).toBe('ACK');
    await pause(200);
    expect(ofRoom(h1, 'ROOM_CANCELLED', room.id)).toHaveLength(n);
  });
});

describe('connection lifecycle and restarts', () => {
  it('closing a socket drops it from focus:<id> but the user stays a participant', async () => {
    const room = await newRoom({ inviteUserIds: [] });
    const tmp = await connect(ctx, host);
    await tmp.request('ROOM_JOIN', { roomId: room.id });
    const before = ctx.wsServer.rooms.size(`focus:${room.id}`);
    tmp.ws.close(); await tmp.closed();
    expect(await until(() => ctx.wsServer.rooms.size(`focus:${room.id}`) === before - 1)).toBe(true);
    const doc = await FocusRoom.findById(room.id).lean();
    expect(doc.participants.filter((p) => !p.leftAt).map((p) => String(p.user))).toEqual([host.user.id]);
  });

  it('after a server restart the timer is re-armed from MongoDB and the room still completes', async () => {
    const room = await newRoom();
    await h1.request('ROOM_JOIN', { roomId: room.id }); await m1.request('ROOM_JOIN', { roomId: room.id });
    await h1.request('ROOM_START', { roomId: room.id });
    // "Restart": a brand-new server process state on the same database. The first server's in-memory timer is not involved.
    ctx.wsServer.focusTimer.disarm(room.id);
    await FocusRoom.updateOne({ _id: room.id }, { $set: { endsAt: new Date(Date.now() + 900) } });
    const second = await startExtra(ctx, { focusTickMs: 150 });
    try {
      expect(await until(() => second.wsServer.focusTimer.isArmed(room.id))).toBe(true); // re-armed from the database
      const mc = await connect(second, member);
      const done = await mc.waitFor((f) => f.type === 'ROOM_COMPLETED' && f.payload.roomId === room.id, 4000);
      expect(done.payload.durationSec).toBe(1500);
      expect((await FocusRoom.findById(room.id).lean()).status).toBe('completed');
    } finally { await second.stop(); }
  });

  it('rooms that ended while the server was down are completed as soon as it starts', async () => {
    const room = await newRoom({ inviteUserIds: [] });
    await h1.request('ROOM_JOIN', { roomId: room.id });
    await h1.request('ROOM_START', { roomId: room.id });
    ctx.wsServer.focusTimer.disarm(room.id);
    await FocusRoom.updateOne({ _id: room.id }, { $set: { endsAt: new Date(Date.now() - 60_000) } });
    const second = await startExtra(ctx, { focusTickMs: 150 });
    try {
      expect(await until(async () => (await FocusRoom.findById(room.id).lean()).status === 'completed', 3000)).toBe(true);
    } finally { await second.stop(); }
  });

  it('graceful shutdown stops the timers', async () => {
    const own = await startExtra(ctx, { focusTickMs: 100 });
    const room = await newRoom({ inviteUserIds: [] });
    await h1.request('ROOM_START', { roomId: room.id }).catch(() => {});
    own.wsServer.focusTimer.arm(room.id, new Date(Date.now() + 60_000));
    expect(own.wsServer.focusTimer.armedCount()).toBeGreaterThan(0);
    await own.stop();
    expect(own.wsServer.focusTimer.armedCount()).toBe(0);
  });
});
