// INTEGRATION (real Express + real MongoDB): friend requests, friendships, blocking.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestApp, resetDb, registerUser, befriend, bearer, captureEvents, oid, mongoose } from '../helpers/app.js';
import { Friendship } from '../../src/models/Friendship.js';
import { EVENTS } from '../../src/utils/events.js';

let t;
const http = () => t.http();
const F = '/api/v1/friends';
beforeAll(async () => { t = await startTestApp(); });
afterAll(async () => { await mongoose.connection.dropDatabase(); await t.stop(); });
beforeEach(resetDb);

const send = (from, to) => http().post(`${F}/requests`).set(bearer(from.accessToken)).send({ userId: to.user.id });
const accept = (me, from) => http().post(`${F}/requests/${from.user.id}/accept`).set(bearer(me.accessToken));
const state = async (viewer, other) => (await http().get(`/api/v1/users/${other.user.id}`).set(bearer(viewer.accessToken))).body.data?.friendship;

describe('auth', () => {
  it.each([['get', F], ['get', `${F}/requests`], ['post', `${F}/requests`]])('%s %s requires a token', async (m, p) => {
    expect((await http()[m](p).send({})).status).toBe(401);
  });
});

describe('POST /friends/requests', () => {
  it('201 with the outgoing Friend, and notifies both users in real time (friend:updated)', async () => {
    const [a, b] = [await registerUser(http), await registerUser(http)];
    const ev = captureEvents(EVENTS.FRIEND_UPDATED);
    const res = await send(a, b);
    ev.stop();
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'pending', user: { id: b.user.id, username: b.user.username } });
    expect(new Date(res.body.data.since).toISOString()).toBe(res.body.data.since);
    expect(res.body.data.user.email).toBeUndefined();
    expect(ev.got).toEqual([
      { recipientId: a.user.id, userId: b.user.id, friendship: 'pending_out' },
      { recipientId: b.user.id, userId: a.user.id, friendship: 'pending_in' },
    ]);
    expect(await state(a, b)).toBe('pending_out');
    expect(await state(b, a)).toBe('pending_in');
  });

  it('409 for a duplicate, for a request in the other direction, and for existing friends', async () => {
    const [a, b] = [await registerUser(http), await registerUser(http)];
    await send(a, b);
    for (const r of [await send(a, b), await send(b, a)]) {
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe('CONFLICT');
    }
    await accept(b, a);
    expect((await send(a, b)).status).toBe(409);
  });

  it('400 for yourself or a malformed id, 404 for an unknown or disabled user', async () => {
    const a = await registerUser(http);
    expect((await http().post(`${F}/requests`).set(bearer(a.accessToken)).send({ userId: a.user.id })).status).toBe(400);
    expect((await http().post(`${F}/requests`).set(bearer(a.accessToken)).send({ userId: 'nope' })).status).toBe(400);
    expect((await http().post(`${F}/requests`).set(bearer(a.accessToken)).send({ userId: oid().toString() })).status).toBe(404);
    expect((await http().post(`${F}/requests`).set(bearer(a.accessToken)).send({})).status).toBe(400);
  });

  it('race: 8 simultaneous identical requests create exactly one pending friendship', async () => {
    const [a, b] = [await registerUser(http), await registerUser(http)];
    const rs = await Promise.all(Array.from({ length: 8 }, () => send(a, b)));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409)).toHaveLength(7);
    expect(await Friendship.countDocuments({})).toBe(1);
  });

  it('race: A->B and B->A at the same instant leave exactly one friendship document', async () => {
    const [a, b] = [await registerUser(http), await registerUser(http)];
    const rs = await Promise.all([send(a, b), send(b, a), send(a, b), send(b, a)]);
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await Friendship.countDocuments({})).toBe(1);
  });
});

describe('requests, accept, decline, cancel, remove', () => {
  it('lists incoming and outgoing requests; accept makes both friends', async () => {
    const [a, b, c] = [await registerUser(http), await registerUser(http), await registerUser(http)];
    await send(a, b); await send(c, b);
    let r = await http().get(`${F}/requests`).set(bearer(b.accessToken));
    expect(r.body.data.incoming.map((f) => f.user.id).sort()).toEqual([a.user.id, c.user.id].sort());
    expect(r.body.data.outgoing).toEqual([]);
    r = await http().get(`${F}/requests`).set(bearer(a.accessToken));
    expect(r.body.data.outgoing.map((f) => f.user.id)).toEqual([b.user.id]);

    const acc = await accept(b, a);
    expect(acc.status).toBe(200);
    expect(acc.body.data).toMatchObject({ status: 'accepted', user: { id: a.user.id } });
    for (const [me, other] of [[a, b], [b, a]]) {
      const list = await http().get(F).set(bearer(me.accessToken));
      expect(list.body.data.map((f) => f.user.id)).toEqual([other.user.id]);
      expect(list.body.data[0].status).toBe('accepted');
    }
    expect(await state(a, b)).toBe('friends');
    expect((await http().get(`${F}/requests`).set(bearer(b.accessToken))).body.data.incoming.map((f) => f.user.id)).toEqual([c.user.id]);
  });

  it('only the recipient can accept; accepting twice or without a request is 404', async () => {
    const [a, b] = [await registerUser(http), await registerUser(http)];
    await send(a, b);
    expect((await accept(a, b)).status).toBe(404); // the requester cannot accept their own request
    expect((await accept(b, a)).status).toBe(200);
    expect((await accept(b, a)).status).toBe(404);
    const stranger = await registerUser(http);
    expect((await accept(stranger, a)).status).toBe(404);
  });

  it('decline removes an incoming request; the requester can cancel an outgoing one; both 204', async () => {
    const [a, b, c] = [await registerUser(http), await registerUser(http), await registerUser(http)];
    await send(a, b);
    expect((await http().post(`${F}/requests/${a.user.id}/decline`).set(bearer(b.accessToken))).status).toBe(204);
    expect(await state(a, b)).toBe('none');
    await send(a, c);
    expect((await http().post(`${F}/requests/${c.user.id}/decline`).set(bearer(a.accessToken))).status).toBe(204);
    expect(await Friendship.countDocuments({})).toBe(0);
    expect((await http().post(`${F}/requests/${c.user.id}/decline`).set(bearer(a.accessToken))).status).toBe(404);
    expect((await send(a, b)).status).toBe(201); // can ask again after a decline
  });

  it('unfriend deletes the friendship for both sides', async () => {
    const [a, b] = [await registerUser(http), await registerUser(http)];
    await befriend(http, a, b);
    const ev = captureEvents(EVENTS.FRIEND_UPDATED);
    expect((await http().delete(`${F}/${b.user.id}`).set(bearer(a.accessToken))).status).toBe(204);
    ev.stop();
    expect(ev.got.map((e) => e.friendship)).toEqual(['none', 'none']);
    expect((await http().get(F).set(bearer(b.accessToken))).body.data).toEqual([]);
    expect((await http().delete(`${F}/${b.user.id}`).set(bearer(a.accessToken))).status).toBe(404);
  });

  it('never leaks other people\'s relationships', async () => {
    const [a, b, c] = [await registerUser(http), await registerUser(http), await registerUser(http)];
    await befriend(http, a, b);
    expect((await http().get(F).set(bearer(c.accessToken))).body.data).toEqual([]);
    expect((await http().delete(`${F}/${a.user.id}`).set(bearer(c.accessToken))).status).toBe(404);
  });
});

describe('blocking', () => {
  it('block ends a friendship, hides the blocker from the blocked user, and is not revealed to them', async () => {
    const [a, b] = [await registerUser(http), await registerUser(http)];
    await befriend(http, a, b);
    const ev = captureEvents(EVENTS.FRIEND_UPDATED);
    expect((await http().post(`${F}/${b.user.id}/block`).set(bearer(a.accessToken))).status).toBe(204);
    ev.stop();
    expect(ev.got).toEqual([
      { recipientId: a.user.id, userId: b.user.id, friendship: 'blocked' },
      { recipientId: b.user.id, userId: a.user.id, friendship: 'none' }, // a block is never revealed
    ]);
    expect(await state(a, b)).toBe('blocked');
    expect((await http().get(`/api/v1/users/${a.user.id}`).set(bearer(b.accessToken))).status).toBe(404);
    expect((await http().get(`/api/v1/users/search?q=${a.user.username}`).set(bearer(b.accessToken))).body.data).toEqual([]);
    expect((await send(b, a)).status).toBe(404); // looks like the user does not exist
    expect((await send(a, b)).status).toBe(409); // blocker must unblock first
    expect((await http().get(F).set(bearer(a.accessToken))).body.data).toEqual([]);
  });

  it('blocking works without a prior relationship, is idempotent, and does not overwrite an existing block by the other user', async () => {
    const [a, b] = [await registerUser(http), await registerUser(http)];
    expect((await http().post(`${F}/${b.user.id}/block`).set(bearer(a.accessToken))).status).toBe(204);
    expect((await http().post(`${F}/${b.user.id}/block`).set(bearer(a.accessToken))).status).toBe(204);
    expect((await http().post(`${F}/${a.user.id}/block`).set(bearer(b.accessToken))).status).toBe(204); // b tries to block back
    const doc = await Friendship.findOne({});
    expect(doc.status).toBe('blocked');
    expect(String(doc.blockedBy)).toBe(a.user.id); // schema stores one blocker; the first block stands
    expect(await Friendship.countDocuments({})).toBe(1);
  });

  it('unblock only works for the blocker and returns to "none"', async () => {
    const [a, b] = [await registerUser(http), await registerUser(http)];
    await http().post(`${F}/${b.user.id}/block`).set(bearer(a.accessToken));
    expect((await http().delete(`${F}/${a.user.id}/block`).set(bearer(b.accessToken))).status).toBe(204); // no effect
    expect(await Friendship.countDocuments({ status: 'blocked' })).toBe(1);
    expect((await http().delete(`${F}/${b.user.id}/block`).set(bearer(a.accessToken))).status).toBe(204);
    expect(await Friendship.countDocuments({})).toBe(0);
    expect(await state(a, b)).toBe('none');
    expect((await send(a, b)).status).toBe(201);
  });

  it('cannot block yourself', async () => {
    const a = await registerUser(http);
    expect((await http().post(`${F}/${a.user.id}/block`).set(bearer(a.accessToken))).status).toBe(400);
  });
});
