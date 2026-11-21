// INTEGRATION (real MongoDB + Express). No mocks. WS-facing write services are called directly, as Chat 04's handlers will.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestApp, resetDb, registerUser, befriend, bearer, oid, mongoose } from '../helpers/app.js';
import { FocusRoom } from '../../src/models/FocusRoom.js';
import { RoomMessage } from '../../src/models/RoomMessage.js';
import * as svc from '../../src/services/focus.service.js';

let t;
const http = () => t.http();
const R = '/api/v1/focus-rooms';
beforeAll(async () => { t = await startTestApp(); });
afterAll(async () => { await mongoose.connection.dropDatabase(); await t.stop(); });
beforeEach(async () => { await resetDb(); });
const users = (n) => Promise.all(Array.from({ length: n }, () => registerUser(http)));
const get = (u, path) => http().get(`${R}${path}`).set(bearer(u.accessToken));
const id = (u) => u.user.id;
async function setup() {
  const [host, a, b, outsider] = await users(4);
  await befriend(http, host, a); await befriend(http, host, b);
  return { host, a, b, outsider };
}

describe('createRoom', () => {
  it('creates a lobby room with the host as first participant and returns the contract shape', async () => {
    const { host, a } = await setup();
    const { room, newlyInvited } = await svc.createRoom(id(host), { title: ' Study ', durationSec: 1500, inviteUserIds: [id(a), id(a), id(host)] });
    expect(newlyInvited).toEqual([id(a)]);
    expect(room).toMatchObject({ title: 'Study', hostId: id(host), durationSec: 1500, status: 'lobby', startedAt: null, endsAt: null, invitedIds: [id(a)] });
    expect(room.participants.map((p) => p.user.id)).toEqual([id(host)]);
    expect(room.participants[0].user).not.toHaveProperty('email');
  });
  it('validates title, duration, invitees (must be friends) and the open-room cap', async () => {
    const { host, outsider } = await setup();
    const bad = (o) => svc.createRoom(id(host), { title: 'T', durationSec: 600, ...o });
    await expect(bad({ title: '  ' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(bad({ title: 'x'.repeat(61) })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    for (const d of [299, 14401, 600.5, '600', undefined]) await expect(bad({ durationSec: d })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(bad({ durationSec: 300 })).resolves.toBeTruthy();
    await expect(bad({ inviteUserIds: [id(outsider)] })).rejects.toMatchObject({ code: 'FORBIDDEN' }); // not a friend
    await expect(bad({ inviteUserIds: ['nope'] })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await bad({}); await bad({});
    await expect(bad({})).rejects.toMatchObject({ code: 'CONFLICT' }); // 4th open room
  });
});

describe('access and HTTP reads', () => {
  it('detail: host, invited and participants may read; strangers get 403; unknown or bad ids 404', async () => {
    const { host, a, b, outsider } = await setup();
    const { room } = await svc.createRoom(id(host), { title: 'R', durationSec: 600, inviteUserIds: [id(a)] });
    expect((await get(host, `/${room.id}`)).body.data.id).toBe(room.id);
    expect((await get(a, `/${room.id}`)).status).toBe(200);
    expect((await get(b, `/${room.id}`)).status).toBe(403);
    expect((await get(outsider, `/${room.id}`)).status).toBe(403);
    expect((await get(host, `/${oid()}`)).status).toBe(404);
    expect((await get(host, '/not-an-id')).status).toBe(400);
  });
  it('list scopes: mine = hosted/joined open rooms; joinable = invited and not yet joined; ended rooms vanish', async () => {
    const { host, a, b } = await setup();
    const r1 = (await svc.createRoom(id(host), { title: 'One', durationSec: 600, inviteUserIds: [id(a)] })).room;
    const r2 = (await svc.createRoom(id(host), { title: 'Two', durationSec: 600, inviteUserIds: [id(b)] })).room;
    const ids = async (u, scope) => (await get(u, `?scope=${scope}`)).body.data.map((r) => r.id).sort();
    expect(await ids(host, 'mine')).toEqual([r1.id, r2.id].sort());
    expect(await ids(host, 'joinable')).toEqual([]);
    expect(await ids(a, 'joinable')).toEqual([r1.id]);
    expect(await ids(a, 'mine')).toEqual([]);
    await svc.joinRoom(id(a), r1.id);
    expect(await ids(a, 'joinable')).toEqual([]);
    expect(await ids(a, 'mine')).toEqual([r1.id]);
    await svc.cancelRoom(id(host), r2.id);
    expect(await ids(host, 'mine')).toEqual([r1.id]);
    expect(await ids(b, 'joinable')).toEqual([]);
    expect((await get(a, '?scope=all')).status).toBe(400);
    expect((await get(a, '')).status).toBe(400);
    expect((await http().get(R)).status).toBe(401);
  });
});

describe('join / leave', () => {
  it('invited users can join (system line, snapshot, serverNow); idempotent; strangers 403', async () => {
    const { host, a, b } = await setup();
    const { room } = await svc.createRoom(id(host), { title: 'R', durationSec: 600, inviteUserIds: [id(a)] });
    const j = await svc.joinRoom(id(a), room.id);
    expect(j.joined).toBe(true);
    expect(j.room.participants.map((p) => p.user.id).sort()).toEqual([id(host), id(a)].sort());
    expect(j.systemMessage).toMatchObject({ kind: 'join', senderId: id(a) });
    expect(j.serverNow).toBeInstanceOf(Date);
    const again = await svc.joinRoom(id(a), room.id);
    expect(again.joined).toBe(false);
    expect(again.systemMessage).toBeNull();
    expect(await RoomMessage.countDocuments({ roomId: room.id, kind: 'join' })).toBe(1);
    await expect(svc.joinRoom(id(b), room.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(svc.joinRoom(id(a), oid().toString())).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('race: the same user joining 8 times at once creates one participant and one system line', async () => {
    const { host, a } = await setup();
    const { room } = await svc.createRoom(id(host), { title: 'R', durationSec: 600, inviteUserIds: [id(a)] });
    await Promise.all(Array.from({ length: 8 }, () => svc.joinRoom(id(a), room.id)));
    const raw = await FocusRoom.findById(room.id).lean();
    expect(raw.participants.filter((p) => String(p.user) === id(a))).toHaveLength(1);
    expect(await RoomMessage.countDocuments({ roomId: room.id, kind: 'join' })).toBe(1);
  });
  it('leave and re-join work; a leaver loses chat rights but keeps read access to history', async () => {
    const { host, a } = await setup();
    const { room } = await svc.createRoom(id(host), { title: 'R', durationSec: 600, inviteUserIds: [id(a)] });
    await svc.joinRoom(id(a), room.id);
    const l = await svc.leaveRoom(id(a), room.id);
    expect(l).toMatchObject({ left: true, cancelled: false });
    expect(l.room.participants.map((p) => p.user.id)).toEqual([id(host)]);
    expect((await svc.leaveRoom(id(a), room.id)).left).toBe(false); // idempotent
    await expect(svc.sendRoomMessage(id(a), room.id, 'hi')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await get(a, `/${room.id}/messages`)).status).toBe(200);
    expect((await svc.joinRoom(id(a), room.id)).joined).toBe(true);
    expect((await get(a, `/${room.id}`)).body.data.participants).toHaveLength(2);
  });
  it('host leaving a lobby cancels the room; host leaving a running room does not', async () => {
    const { host } = await setup();
    const lobby = (await svc.createRoom(id(host), { title: 'L', durationSec: 600 })).room;
    expect(await svc.leaveRoom(id(host), lobby.id)).toMatchObject({ cancelled: true, room: { status: 'cancelled' } });
    const running = (await svc.createRoom(id(host), { title: 'Run', durationSec: 600 })).room;
    await svc.startRoom(id(host), running.id);
    expect(await svc.leaveRoom(id(host), running.id)).toMatchObject({ cancelled: false, room: { status: 'running' } });
  });
  it('a full room (20 active participants) rejects further joins', async () => {
    const { host } = await setup();
    const fill = await users(20);
    for (const u of fill) await befriend(http, host, u);
    const { room } = await svc.createRoom(id(host), { title: 'Big', durationSec: 600, inviteUserIds: fill.map(id) });
    for (const u of fill.slice(0, 19)) await svc.joinRoom(id(u), room.id); // host + 19 = 20
    await expect(svc.joinRoom(id(fill[19]), room.id)).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('invite / start / cancel / complete', () => {
  it('invite: host only, friends only, reports only NEW invitees', async () => {
    const { host, a, b, outsider } = await setup();
    const { room } = await svc.createRoom(id(host), { title: 'R', durationSec: 600, inviteUserIds: [id(a)] });
    expect((await svc.inviteUsers(id(host), room.id, [id(a), id(b)])).newlyInvited).toEqual([id(b)]);
    await expect(svc.inviteUsers(id(a), room.id, [id(b)])).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(svc.inviteUsers(id(host), room.id, [id(outsider)])).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await get(b, `/${room.id}`)).status).toBe(200);
  });
  it('start: host only, sets endsAt = now + duration from the SERVER clock, lobby only; double start races give one winner', async () => {
    const { host, a } = await setup();
    const { room } = await svc.createRoom(id(host), { title: 'R', durationSec: 1500, inviteUserIds: [id(a)] });
    await svc.joinRoom(id(a), room.id);
    await expect(svc.startRoom(id(a), room.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const results = await Promise.allSettled([svc.startRoom(id(host), room.id), svc.startRoom(id(host), room.id), svc.startRoom(id(host), room.id)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected').every((r) => r.reason.code === 'CONFLICT')).toBe(true);
    const r = (await get(a, `/${room.id}`)).body.data;
    expect(r.status).toBe('running');
    expect(new Date(r.endsAt) - new Date(r.startedAt)).toBe(1500 * 1000);
    expect(await RoomMessage.countDocuments({ roomId: room.id, kind: 'start' })).toBe(1);
  });
  it('cancel: host only, idempotent, not after completion; joining a cancelled room is a conflict', async () => {
    const { host, a } = await setup();
    const { room } = await svc.createRoom(id(host), { title: 'R', durationSec: 600, inviteUserIds: [id(a)] });
    await expect(svc.cancelRoom(id(a), room.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await svc.cancelRoom(id(host), room.id)).changed).toBe(true);
    expect((await svc.cancelRoom(id(host), room.id)).changed).toBe(false);
    await expect(svc.joinRoom(id(a), room.id)).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(svc.startRoom(id(host), room.id)).rejects.toMatchObject({ code: 'CONFLICT' });
    const done = (await svc.createRoom(id(host), { title: 'D', durationSec: 600 })).room;
    await svc.startRoom(id(host), done.id);
    await FocusRoom.updateOne({ _id: done.id }, { endsAt: new Date(Date.now() - 1000) });
    await svc.completeRoomIfDue(done.id);
    await expect(svc.cancelRoom(id(host), done.id)).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('completion: only when due, exactly once under concurrency, with a system line', async () => {
    const { host } = await setup();
    const { room } = await svc.createRoom(id(host), { title: 'R', durationSec: 600 });
    expect(await svc.completeRoomIfDue(room.id)).toBeNull(); // still a lobby
    await svc.startRoom(id(host), room.id);
    expect(await svc.completeRoomIfDue(room.id)).toBeNull(); // not due yet
    await FocusRoom.updateOne({ _id: room.id }, { endsAt: new Date(Date.now() - 1) });
    const rs = await Promise.all(Array.from({ length: 5 }, () => svc.completeRoomIfDue(room.id)));
    expect(rs.filter(Boolean)).toHaveLength(1);
    expect(rs.find(Boolean)).toMatchObject({ room: { status: 'completed' }, durationSec: 600 });
    expect(await RoomMessage.countDocuments({ roomId: room.id, kind: 'complete' })).toBe(1);
    expect(await svc.completeRoomIfDue('bad')).toBeNull();
  });
  it('completeDueRooms and listRunningRooms support restart re-arming', async () => {
    const { host } = await setup();
    const a = (await svc.createRoom(id(host), { title: 'A', durationSec: 600 })).room;
    const b = (await svc.createRoom(id(host), { title: 'B', durationSec: 600 })).room;
    await svc.startRoom(id(host), a.id); await svc.startRoom(id(host), b.id);
    expect((await svc.listRunningRooms()).map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
    await FocusRoom.updateOne({ _id: a.id }, { endsAt: new Date(Date.now() - 5000) });
    const done = await svc.completeDueRooms();
    expect(done.map((d) => d.room.id)).toEqual([a.id]);
    expect((await svc.listRunningRooms()).map((r) => r.id)).toEqual([b.id]);
  });
});

describe('room chat', () => {
  it('participants of an open room can chat (1..500 chars); others and ended rooms cannot', async () => {
    const { host, a, b } = await setup();
    const { room } = await svc.createRoom(id(host), { title: 'R', durationSec: 600, inviteUserIds: [id(a), id(b)] });
    await svc.joinRoom(id(a), room.id);
    const m = await svc.sendRoomMessage(id(a), room.id, '  hello  ');
    expect(m.message).toMatchObject({ roomId: room.id, senderId: id(a), kind: 'text', text: 'hello' });
    await expect(svc.sendRoomMessage(id(b), room.id, 'x')).rejects.toMatchObject({ code: 'FORBIDDEN' }); // invited, not joined
    await expect(svc.sendRoomMessage(id(a), room.id, '   ')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(svc.sendRoomMessage(id(a), room.id, 'x'.repeat(501))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((await svc.sendRoomMessage(id(a), room.id, 'x'.repeat(500))).message.text).toHaveLength(500);
    await svc.cancelRoom(id(host), room.id);
    await expect(svc.sendRoomMessage(id(a), room.id, 'late')).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('history: invited-but-not-joined is 403; paging is newest first with no gaps; ROOM_JOIN snapshot returns the last 50', async () => {
    const { host, a, b } = await setup();
    const { room } = await svc.createRoom(id(host), { title: 'R', durationSec: 600, inviteUserIds: [id(a), id(b)] });
    await svc.joinRoom(id(a), room.id);
    for (let i = 0; i < 60; i += 1) await svc.sendRoomMessage(id(a), room.id, `m${i}`);
    expect((await get(b, `/${room.id}/messages`)).status).toBe(403);
    const seen = []; let before;
    for (;;) {
      const r = await get(a, `/${room.id}/messages?limit=25${before ? `&before=${before}` : ''}`);
      expect(r.status).toBe(200);
      seen.push(...r.body.data);
      if (!r.body.meta.hasMore) break;
      before = r.body.meta.nextCursor;
    }
    expect(seen).toHaveLength(61); // a's join line + 60 chat messages (creating a room writes no line for the host)
    expect(new Set(seen.map((m) => m.id)).size).toBe(61);
    const texts = seen.filter((m) => m.kind === 'text').map((m) => m.text);
    expect(texts).toEqual(Array.from({ length: 60 }, (_, i) => `m${59 - i}`));
    const snap = await svc.joinRoom(id(b), room.id);
    expect(snap.messages).toHaveLength(50);
    expect(snap.messages[0]).toMatchObject({ kind: 'join', senderId: id(b) }); // newest first: b's own join line
    expect((await get(a, `/${room.id}/messages?limit=51`)).status).toBe(400);
    expect((await get(a, `/${room.id}/messages?before=bad`)).status).toBe(400);
  });
});
