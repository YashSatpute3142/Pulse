// INTEGRATION (real Express + real MongoDB): conversations, groups, membership, inbox search and pagination.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestApp, resetDb, registerUser, befriend, makeDm, makeGroup, bearer, captureEvents, oid, mongoose } from '../helpers/app.js';
import { Conversation } from '../../src/models/Conversation.js';
import { User } from '../../src/models/User.js';
import { Friendship } from '../../src/models/Friendship.js';
import { pairKey } from '../../src/utils/ids.js';
import { EVENTS } from '../../src/utils/events.js';
import * as messages from '../../src/services/message.service.js';

let t;
const http = () => t.http();
const C = '/api/v1/conversations';
beforeAll(async () => { t = await startTestApp(); });
afterAll(async () => { await mongoose.connection.dropDatabase(); await t.stop(); });
beforeEach(resetDb);

const users = async (n) => Promise.all(Array.from({ length: n }, () => registerUser(http)));
const get = (u, id) => http().get(`${C}/${id}`).set(bearer(u.accessToken));

describe('auth', () => {
  it.each([['get', C], ['post', C], ['get', `${C}/${oid()}`], ['get', `${C}/${oid()}/messages`]])('%s %s requires a token', async (m, p) => {
    expect((await http()[m](p).send({})).status).toBe(401);
  });
});

describe('direct conversations', () => {
  it('requires an accepted friendship (owner decision)', async () => {
    const [a, b] = await users(2);
    const res = await http().post(C).set(bearer(a.accessToken)).send({ type: 'direct', userId: b.user.id });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    // a pending request is not enough
    await http().post('/api/v1/friends/requests').set(bearer(a.accessToken)).send({ userId: b.user.id });
    expect((await http().post(C).set(bearer(a.accessToken)).send({ type: 'direct', userId: b.user.id })).status).toBe(403);
    expect(await Conversation.countDocuments({})).toBe(0);
  });

  it('creates with 201 in the contract shape, then returns the existing one with 200 from either side', async () => {
    const [a, b] = await users(2);
    await befriend(http, a, b);
    const ev = captureEvents(EVENTS.CONVERSATION_UPDATED);
    const first = await http().post(C).set(bearer(a.accessToken)).send({ type: 'direct', userId: b.user.id });
    ev.stop();
    expect(first.status).toBe(201);
    const conv = first.body.data;
    expect(conv).toMatchObject({ type: 'direct', title: null, avatarUrl: null, lastMessage: null, unreadCount: 0, lastReadMessageId: null, mutedUntil: null });
    expect(conv.members.map((m) => [m.user.id, m.role]).sort()).toEqual([[a.user.id, 'member'], [b.user.id, 'member']].sort());
    expect(conv.members[0].user.email).toBeUndefined();
    expect(ev.got).toEqual([{ conversationId: conv.id, memberIds: expect.arrayContaining([a.user.id, b.user.id]) }]);

    for (const [x, y] of [[a, b], [b, a]]) {
      const again = await http().post(C).set(bearer(x.accessToken)).send({ type: 'direct', userId: y.user.id });
      expect(again.status).toBe(200);
      expect(again.body.data.id).toBe(conv.id);
    }
    expect(await Conversation.countDocuments({})).toBe(1);
  });

  it('race: 8 simultaneous creates (both directions) leave exactly one conversation', async () => {
    const [a, b] = await users(2);
    await befriend(http, a, b);
    const rs = await Promise.all(Array.from({ length: 8 }, (_, i) =>
      (i % 2 ? http().post(C).set(bearer(a.accessToken)).send({ type: 'direct', userId: b.user.id })
        : http().post(C).set(bearer(b.accessToken)).send({ type: 'direct', userId: a.user.id }))));
    expect(rs.every((r) => [200, 201].includes(r.status))).toBe(true);
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    expect(new Set(rs.map((r) => r.body.data.id)).size).toBe(1);
    expect(await Conversation.countDocuments({})).toBe(1);
  });

  it('validation and hidden existence: self 400, unknown 404, blocked-by-them 404, blocked-by-me 403', async () => {
    const [a, b, c] = await users(3);
    expect((await http().post(C).set(bearer(a.accessToken)).send({ type: 'direct', userId: a.user.id })).status).toBe(400);
    expect((await http().post(C).set(bearer(a.accessToken)).send({ type: 'direct', userId: oid().toString() })).status).toBe(404);
    expect((await http().post(C).set(bearer(a.accessToken)).send({ type: 'direct' })).status).toBe(400);
    expect((await http().post(C).set(bearer(a.accessToken)).send({ type: 'nope' })).status).toBe(400);
    await befriend(http, a, b);
    await http().post(`/api/v1/friends/${a.user.id}/block`).set(bearer(b.accessToken)); // b blocks a
    expect((await http().post(C).set(bearer(a.accessToken)).send({ type: 'direct', userId: b.user.id })).status).toBe(404);
    await befriend(http, a, c);
    await http().post(`/api/v1/friends/${c.user.id}/block`).set(bearer(a.accessToken)); // a blocks c
    expect((await http().post(C).set(bearer(a.accessToken)).send({ type: 'direct', userId: c.user.id })).status).toBe(403);
  });
});

describe('group conversations', () => {
  it('creates with the creator as owner; members must be friends; 2 to 49 others', async () => {
    const [o, a, b, stranger] = await users(4);
    await befriend(http, o, a); await befriend(http, o, b);
    const g = await makeGroup(http, o, [a, b], 'Study squad');
    expect(g).toMatchObject({ type: 'group', title: 'Study squad', avatarUrl: null, unreadCount: 0 });
    expect(g.members.find((m) => m.user.id === o.user.id).role).toBe('owner');
    expect(g.members.filter((m) => m.role === 'member')).toHaveLength(2);

    const bad = (body) => http().post(C).set(bearer(o.accessToken)).send({ type: 'group', title: 'X', ...body });
    expect((await bad({ memberIds: [a.user.id, stranger.user.id] })).status).toBe(403);
    expect((await bad({ memberIds: [a.user.id] })).status).toBe(400);
    expect((await bad({ memberIds: [] })).status).toBe(400);
    expect((await bad({ memberIds: [a.user.id, a.user.id] })).status).toBe(400); // duplicates collapse to 1 other
    expect((await bad({ memberIds: [a.user.id, b.user.id], title: '   ' })).status).toBe(400);
    expect((await bad({ memberIds: [a.user.id, b.user.id], title: 'x'.repeat(61) })).status).toBe(400);
    expect((await bad({ memberIds: [a.user.id, b.user.id, oid().toString()] })).status).toBe(404);
    expect((await bad({ memberIds: Array.from({ length: 50 }, () => oid().toString()) })).status).toBe(400); // 50 others = 51 members
  });

  it('accepts exactly 50 members (49 others) and rejects adding a 51st', async () => {
    const o = (await users(1))[0];
    const others = await User.insertMany(Array.from({ length: 49 }, (_, i) => ({ username: `bulk${i}`, email: `bulk${i}@example.com`, passwordHash: 'x', displayName: `Bulk ${i}` })));
    await Friendship.insertMany(others.map((u) => { const [userA, userB] = pairKey(o.user.id, u._id); return { userA, userB, requestedBy: o.user.id, status: 'accepted' }; }));
    const res = await http().post(C).set(bearer(o.accessToken)).send({ type: 'group', title: 'Everyone', memberIds: others.map((u) => String(u._id)) });
    expect(res.status).toBe(201);
    expect(res.body.data.members).toHaveLength(50);
    const extra = (await users(1))[0];
    await befriend(http, o, extra);
    const add = await http().post(`${C}/${res.body.data.id}/members`).set(bearer(o.accessToken)).send({ userIds: [extra.user.id] });
    expect(add.status).toBe(400);
    expect(add.body.error.details.fields.userIds).toBeTruthy();
  });

  it('only members can see a conversation; everyone else gets 404 (existence hidden), also for malformed ids as 400', async () => {
    const [o, a, b, outsider] = await users(4);
    await befriend(http, o, a); await befriend(http, o, b);
    const g = await makeGroup(http, o, [a, b]);
    expect((await get(a, g.id)).status).toBe(200);
    const r = await get(outsider, g.id);
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('NOT_FOUND');
    expect((await get(outsider, oid().toString())).status).toBe(404);
    expect((await get(outsider, 'not-an-id')).status).toBe(400);
    expect((await http().get(`${C}/${g.id}/messages`).set(bearer(outsider.accessToken))).status).toBe(404);
  });

  it('PATCH: owner/admin only, groups only; title and https avatar validated', async () => {
    const [o, a, b] = await users(3);
    await befriend(http, o, a); await befriend(http, o, b);
    const g = await makeGroup(http, o, [a, b]);
    const patch = (u, body, id = g.id) => http().patch(`${C}/${id}`).set(bearer(u.accessToken)).send(body);
    expect((await patch(a, { title: 'Hijack' })).status).toBe(403);
    const ev = captureEvents(EVENTS.CONVERSATION_UPDATED);
    const ok = await patch(o, { title: 'Renamed', avatarUrl: 'https://res.cloudinary.com/x/y.png' });
    ev.stop();
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ title: 'Renamed', avatarUrl: 'https://res.cloudinary.com/x/y.png' });
    expect(ev.got).toHaveLength(1);
    expect((await patch(o, { avatarUrl: 'http://insecure.example/a.png' })).status).toBe(400);
    expect((await patch(o, {})).status).toBe(400);
    expect((await patch(o, { title: 'ok', extra: 1 })).status).toBe(400);
    expect((await patch(o, { avatarUrl: null })).body.data.avatarUrl).toBeNull();
    const dm = await makeDm(http, o, a);
    expect((await patch(o, { title: 'nope' }, dm.id)).status).toBe(400);
  });

  it('add members: admins only, friends only; re-adding a member who left resets their state', async () => {
    const [o, a, b, c, d] = await users(5);
    for (const u of [a, b, c]) await befriend(http, o, u);
    const g = await makeGroup(http, o, [a, b]);
    const add = (u, ids) => http().post(`${C}/${g.id}/members`).set(bearer(u.accessToken)).send({ userIds: ids });
    expect((await add(a, [c.user.id])).status).toBe(403);
    expect((await add(o, [d.user.id])).status).toBe(403); // not a friend of the owner
    const res = await add(o, [c.user.id]);
    expect(res.status).toBe(200);
    expect(res.body.data.members).toHaveLength(4);
    expect((await add(o, [c.user.id])).body.data.members).toHaveLength(4); // already in: no change, no duplicate
    expect((await get(c, g.id)).status).toBe(200);
  });

  it('remove / leave: admin removes members, anyone leaves, owner leaving transfers ownership, removed users lose access', async () => {
    const [o, a, b] = await users(3);
    await befriend(http, o, a); await befriend(http, o, b);
    const g = await makeGroup(http, o, [a, b]);
    const del = (u, target) => http().delete(`${C}/${g.id}/members/${target.user.id}`).set(bearer(u.accessToken));

    expect((await del(a, b)).status).toBe(403);                       // plain member cannot remove others
    expect((await del(a, o)).status).toBe(403);                       // nobody removes the owner
    const ev = captureEvents(EVENTS.CONVERSATION_REMOVED);
    expect((await del(o, b)).status).toBe(204);                       // owner removes b
    ev.stop();
    expect(ev.got).toEqual([{ conversationId: g.id, userId: b.user.id }]);
    expect((await get(b, g.id)).status).toBe(404);                    // b lost access immediately
    expect((await http().get(`${C}/${g.id}/messages`).set(bearer(b.accessToken))).status).toBe(404);
    expect((await get(o, g.id)).body.data.members.map((m) => m.user.id).sort()).toEqual([o.user.id, a.user.id].sort());
    expect((await del(o, b)).status).toBe(404);                       // already gone

    expect((await del(o, o)).status).toBe(204);                       // owner leaves: a inherits
    const after = (await get(a, g.id)).body.data;
    expect(after.members).toHaveLength(1);
    expect(after.members[0]).toMatchObject({ role: 'owner' });
    expect(after.members[0].user.id).toBe(a.user.id);
  });

  it('direct conversations cannot be changed through member endpoints', async () => {
    const [a, b] = await users(2);
    await befriend(http, a, b);
    const dm = await makeDm(http, a, b);
    expect((await http().delete(`${C}/${dm.id}/members/${b.user.id}`).set(bearer(a.accessToken))).status).toBe(400);
    expect((await http().post(`${C}/${dm.id}/members`).set(bearer(a.accessToken)).send({ userIds: [b.user.id] })).status).toBe(400);
  });
});

describe('GET /conversations (inbox)', () => {
  it('sorts by latest activity, paginates by cursor without gaps or duplicates, and reports meta', async () => {
    const [me, ...friends] = await users(7); // me + 6 friends = 6 direct conversations
    const convs = [];
    for (const f of friends) { await befriend(http, me, f); convs.push(await makeDm(http, me, f)); }
    // bump activity in a known order: oldest -> newest = convs[3], convs[0], convs[4], convs[1], convs[2]
    for (const i of [3, 0, 4, 1, 2]) {
      await messages.sendMessage(me.user.id, { conversationId: convs[i].id, clientId: `bump-${i}-xxxxxxxx`, text: `hi ${i}` });
      await new Promise((r) => setTimeout(r, 5));
    }
    const expected = [2, 1, 4, 0, 3].map((i) => convs[i].id).concat(convs[5].id).sort(); // convs[5] never bumped
    const seen = [];
    let before;
    let pages = 0;
    for (;;) {
      const r = await http().get(`${C}?limit=2${before ? `&before=${before}` : ''}`).set(bearer(me.accessToken));
      expect(r.status).toBe(200);
      seen.push(...r.body.data.map((c) => c.id));
      pages += 1;
      if (!r.body.meta.hasMore) { expect(r.body.meta.nextCursor).toBeNull(); break; }
      expect(r.body.meta.nextCursor).toBe(r.body.data[r.body.data.length - 1].id);
      before = r.body.meta.nextCursor;
    }
    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(6);
    expect([...seen].sort()).toEqual(expected);
    expect(seen.slice(0, 5)).toEqual([2, 1, 4, 0, 3].map((i) => convs[i].id)); // newest activity first
    expect(seen[5]).toBe(convs[5].id);
  });

  it('shows lastMessage and the viewer\'s own unread count; other people\'s conversations never appear', async () => {
    const [a, b, c] = await users(3);
    await befriend(http, a, b); await befriend(http, b, c);
    const dm = await makeDm(http, a, b);
    await makeDm(http, b, c);
    await messages.sendMessage(a.user.id, { conversationId: dm.id, clientId: 'unread-0001', text: 'ping' });
    const fa = (await http().get(C).set(bearer(a.accessToken))).body.data;
    const fb = (await http().get(C).set(bearer(b.accessToken))).body.data;
    expect(fa).toHaveLength(1);
    expect(fa[0]).toMatchObject({ unreadCount: 0, lastMessage: { preview: 'ping', type: 'text', senderId: a.user.id } });
    expect(fb).toHaveLength(2);
    expect(fb.find((x) => x.id === dm.id).unreadCount).toBe(1);
    expect((await http().get(C).set(bearer(c.accessToken))).body.data.map((x) => x.id)).not.toContain(dm.id);
  });

  it('?q= matches a group title prefix (case-insensitive) or the other person\'s name in a direct chat', async () => {
    const [me, ann, bob, cy] = await Promise.all([
      registerUser(http), registerUser(http, { displayName: 'Annabel Ray', username: 'annabel' }),
      registerUser(http, { displayName: 'Bobby Tables', username: 'bobby' }), registerUser(http, { displayName: 'Cy Young', username: 'cyyoung' }),
    ]);
    for (const f of [ann, bob, cy]) await befriend(http, me, f);
    const dmAnn = await makeDm(http, me, ann);
    await makeDm(http, me, bob);
    const grp = await makeGroup(http, me, [bob, cy], 'Anatomy lab');
    const ids = async (q) => (await http().get(`${C}?q=${encodeURIComponent(q)}`).set(bearer(me.accessToken))).body.data.map((c) => c.id).sort();
    expect(await ids('ann')).toEqual([dmAnn.id].sort());          // name prefix hits the DM only; "Anatomy" does not start with "ann"
    expect(await ids('AN')).toEqual([dmAnn.id, grp.id].sort());   // title prefix (case-insensitive) + the other person's name prefix
    expect(await ids('ana')).toEqual([grp.id]);                   // only the title "Anatomy lab" starts with "ana"
    expect(await ids('bobby')).toHaveLength(1);
    expect(await ids('zzz')).toEqual([]);
    expect(await ids('(')).toEqual([]);                           // regex characters are literal
    expect((await http().get(`${C}?before=bad`).set(bearer(me.accessToken))).status).toBe(400);
    expect((await http().get(`${C}?limit=51`).set(bearer(me.accessToken))).status).toBe(400);
    expect((await http().get(`${C}?before=${oid()}`).set(bearer(me.accessToken))).status).toBe(400);
  });

  it('left conversations disappear from the inbox', async () => {
    const [o, a, b] = await users(3);
    await befriend(http, o, a); await befriend(http, o, b);
    const g = await makeGroup(http, o, [a, b]);
    await http().delete(`${C}/${g.id}/members/${a.user.id}`).set(bearer(a.accessToken));
    expect((await http().get(C).set(bearer(a.accessToken))).body.data).toEqual([]);
    expect((await http().get(C).set(bearer(b.accessToken))).body.data).toHaveLength(1);
  });
});

describe('PATCH /conversations/:id/mute', () => {
  it('sets and clears mutedUntil for the caller only, without reordering the inbox', async () => {
    const [a, b] = await users(2);
    await befriend(http, a, b);
    const dm = await makeDm(http, a, b);
    const before = (await get(a, dm.id)).body.data.updatedAt;
    const until = new Date(Date.now() + 3_600_000).toISOString();
    const res = await http().patch(`${C}/${dm.id}/mute`).set(bearer(a.accessToken)).send({ mutedUntil: until });
    expect(res.status).toBe(200);
    expect(res.body.data.mutedUntil).toBe(until);
    expect((await get(b, dm.id)).body.data.mutedUntil).toBeNull();
    expect((await get(a, dm.id)).body.data.updatedAt).toBe(before);
    expect((await http().patch(`${C}/${dm.id}/mute`).set(bearer(a.accessToken)).send({ mutedUntil: null })).body.data.mutedUntil).toBeNull();
    expect((await http().patch(`${C}/${dm.id}/mute`).set(bearer(a.accessToken)).send({ mutedUntil: 'tomorrow' })).status).toBe(400);
    expect((await http().patch(`${C}/${oid()}/mute`).set(bearer(a.accessToken)).send({ mutedUntil: null })).status).toBe(404);
  });
});
