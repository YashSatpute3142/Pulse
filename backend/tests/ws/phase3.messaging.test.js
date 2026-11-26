import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { registerUser, befriend, makeDm, makeGroup, bearer } from '../helpers/app.js';
import { startWsApp, connect, until } from './wsHelpers.js';
import { Message } from '../../src/models/Message.js';

let ctx;
let alice; let bob; let carol; let dm;
let a1; let a2; let b1; let c1;
const uid = () => `cid-${Math.random().toString(36).slice(2, 12)}-${Date.now()}`;

beforeAll(async () => {
  // Chat sends are limited to 10 / 10 s per socket (tested in phase3.core). This file sends far more from one socket, so relax that group only.
  ctx = await startWsApp({ rateGroups: { chat: { capacity: 1000, windowMs: 10_000 }, reaction: { capacity: 1000, windowMs: 10_000 } } });
  alice = await registerUser(ctx.http); bob = await registerUser(ctx.http); carol = await registerUser(ctx.http);
  await befriend(ctx.http, alice, bob);
  dm = await makeDm(ctx.http, alice, bob);
  a1 = await connect(ctx, alice); a2 = await connect(ctx, alice); b1 = await connect(ctx, bob); c1 = await connect(ctx, carol);
});
afterAll(async () => { await ctx.stop(); });

describe('CHAT_MESSAGE', () => {
  it('ACKs the stored message to the sender socket and pushes MESSAGE_NEW to the peer and the sender\'s other tab only', async () => {
    const clientId = uid();
    const pb = b1.nextOf('MESSAGE_NEW'); const pa2 = a2.nextOf('MESSAGE_NEW');
    const ack = await a1.request('CHAT_MESSAGE', { conversationId: dm.id, clientId, text: 'hello bob' });
    expect(ack.type).toBe('ACK');
    const { message } = ack.payload.data;
    expect(message).toMatchObject({ conversationId: dm.id, senderId: alice.user.id, text: 'hello bob', clientId });
    expect((await pb).payload.message.id).toBe(message.id);
    expect((await pa2).payload.message.id).toBe(message.id);
    await a1.quiet(150);
    expect(a1.ofType('MESSAGE_NEW')).toHaveLength(0); // the sending socket only gets the ACK
    expect(c1.ofType('MESSAGE_NEW')).toHaveLength(0); // a stranger gets nothing
  });

  it('persists the message: history over HTTP shows it', async () => {
    const r = await ctx.http().get(`/api/v1/conversations/${dm.id}/messages`).set(bearer(bob.accessToken));
    expect(r.body.data.map((m) => m.text)).toContain('hello bob');
  });

  it('ignores identity fields in the payload: senderId is the socket user', async () => {
    const ack = await a1.request('CHAT_MESSAGE', { conversationId: dm.id, clientId: uid(), text: 'spoof', senderId: bob.user.id, userId: bob.user.id, sender: { id: bob.user.id } });
    expect(ack.type).toBe('ACK');
    expect(ack.payload.data.message.senderId).toBe(alice.user.id);
    const stored = await Message.findById(ack.payload.data.message.id).lean();
    expect(String(stored.senderId)).toBe(alice.user.id);
  });

  it('is idempotent on clientId: a retry returns the original message, stores one row and broadcasts once', async () => {
    const clientId = uid();
    const first = await a1.request('CHAT_MESSAGE', { conversationId: dm.id, clientId, text: 'once' });
    await b1.quiet(100);
    const before = b1.ofType('MESSAGE_NEW').length;
    const retry = await a1.request('CHAT_MESSAGE', { conversationId: dm.id, clientId, text: 'once' });
    expect(retry.payload.data.message.id).toBe(first.payload.data.message.id);
    await b1.quiet(200);
    expect(b1.ofType('MESSAGE_NEW').length).toBe(before);
    expect(await Message.countDocuments({ conversationId: dm.id, clientId })).toBe(1);
  });

  it('keeps the order of rapid sends from one socket (ids ascend in send order)', async () => {
    const ids = [];
    const reqs = [];
    for (let i = 0; i < 8; i += 1) reqs.push(a1.request('CHAT_MESSAGE', { conversationId: dm.id, clientId: uid(), text: `seq-${i}` }));
    for (const r of await Promise.all(reqs)) ids.push(r.payload.data.message.id);
    expect([...ids].sort()).toEqual(ids);
    expect((await Promise.all(ids.map((id) => Message.findById(id).lean()))).map((m) => m.text)).toEqual(Array.from({ length: 8 }, (_, i) => `seq-${i}`));
  });

  it('a non-member cannot post into the conversation and nobody receives anything', async () => {
    const before = b1.ofType('MESSAGE_NEW').length;
    const r = await c1.request('CHAT_MESSAGE', { conversationId: dm.id, clientId: uid(), text: 'intruder' });
    expect(r.type).toBe('ERROR');
    expect(['NOT_FOUND', 'FORBIDDEN']).toContain(r.payload.code);
    await b1.quiet(200);
    expect(b1.ofType('MESSAGE_NEW').length).toBe(before);
    expect(await Message.countDocuments({ text: 'intruder' })).toBe(0);
  });

  it('service rules come through as ERROR frames: empty message -> VALIDATION_ERROR, unknown reply target -> VALIDATION_ERROR', async () => {
    expect((await a1.request('CHAT_MESSAGE', { conversationId: dm.id, clientId: uid(), text: '   ' })).payload.code).toBe('VALIDATION_ERROR');
    expect((await a1.request('CHAT_MESSAGE', { conversationId: dm.id, clientId: uid(), text: 'x', replyTo: 'a'.repeat(24) })).payload.code).toBe('VALIDATION_ERROR');
  });

  it('replies carry the reply preview', async () => {
    const orig = (await a1.request('CHAT_MESSAGE', { conversationId: dm.id, clientId: uid(), text: 'question?' })).payload.data.message;
    const ack = await b1.request('CHAT_MESSAGE', { conversationId: dm.id, clientId: uid(), text: 'answer', replyTo: orig.id });
    expect(ack.payload.data.message.replyTo).toBeTruthy();
  });

  it('unread counters move atomically for the recipient (checked over HTTP)', async () => {
    const r = await ctx.http().get('/api/v1/conversations').set(bearer(bob.accessToken));
    const row = r.body.data.find((c) => c.id === dm.id);
    expect(row.unreadCount).toBeGreaterThan(0);
  });
});

describe('edit / delete / reaction', () => {
  let msg;
  beforeAll(async () => { msg = (await a1.request('CHAT_MESSAGE', { conversationId: dm.id, clientId: uid(), text: 'editable' })).payload.data.message; await b1.nextOf('MESSAGE_NEW').catch(() => {}); });

  it('MESSAGE_EDIT by the sender: ACK, MESSAGE_EDITED to the peer and the sender\'s other tab', async () => {
    const pb = b1.nextOf('MESSAGE_EDITED'); const pa2 = a2.nextOf('MESSAGE_EDITED');
    const r = await a1.request('MESSAGE_EDIT', { messageId: msg.id, text: 'edited text' });
    expect(r.type).toBe('ACK');
    for (const f of [await pb, await pa2]) expect(f.payload).toMatchObject({ conversationId: dm.id, messageId: msg.id, text: 'edited text' });
    expect((await pb).payload.editedAt).toBeTruthy();
  });
  it('MESSAGE_EDIT by someone else is FORBIDDEN and not broadcast', async () => {
    const before = a1.ofType('MESSAGE_EDITED').length;
    const r = await b1.request('MESSAGE_EDIT', { messageId: msg.id, text: 'hacked' });
    expect(r.payload.code).toBe('FORBIDDEN');
    await a1.quiet(150);
    expect(a1.ofType('MESSAGE_EDITED').length).toBe(before);
    expect((await Message.findById(msg.id).lean()).text).toBe('edited text');
  });
  it('a stranger cannot edit, react to, delete or mark-read someone else\'s conversation', async () => {
    for (const [type, payload] of [
      ['MESSAGE_EDIT', { messageId: msg.id, text: 'x' }],
      ['MESSAGE_REACTION', { messageId: msg.id, emoji: '👍', action: 'add' }],
      ['MESSAGE_DELETE', { messageId: msg.id }],
      ['MESSAGE_READ', { conversationId: dm.id, messageId: msg.id }],
    ]) {
      const r = await c1.request(type, payload);
      expect(r.type, type).toBe('ERROR');
      expect(['NOT_FOUND', 'FORBIDDEN'], type).toContain(r.payload.code);
    }
  });
  it('MESSAGE_REACTION add/remove broadcasts the full reactions list (userIds)', async () => {
    const p = a1.nextOf('MESSAGE_REACTION_UPDATED');
    expect((await b1.request('MESSAGE_REACTION', { messageId: msg.id, emoji: '👍', action: 'add' })).type).toBe('ACK');
    expect((await p).payload).toMatchObject({ conversationId: dm.id, messageId: msg.id, reactions: [{ emoji: '👍', userIds: [bob.user.id] }] });
    const p2 = a1.nextOf('MESSAGE_REACTION_UPDATED');
    await b1.request('MESSAGE_REACTION', { messageId: msg.id, emoji: '👍', action: 'remove' });
    expect((await p2).payload.reactions).toEqual([]);
  });
  it('rejects a non-emoji reaction', async () => {
    expect((await b1.request('MESSAGE_REACTION', { messageId: msg.id, emoji: 'abc', action: 'add' })).payload.code).toBe('VALIDATION_ERROR');
  });
  it('MESSAGE_DELETE by the sender broadcasts MESSAGE_DELETED; the content is blanked in the database', async () => {
    const p = b1.nextOf('MESSAGE_DELETED');
    expect((await a1.request('MESSAGE_DELETE', { messageId: msg.id })).type).toBe('ACK');
    expect((await p).payload).toMatchObject({ conversationId: dm.id, messageId: msg.id });
    const row = await Message.findById(msg.id).lean();
    expect(row.deletedAt).toBeTruthy(); expect(row.text).toBe('');
  });
});

describe('MESSAGE_READ and receipts', () => {
  it('advances the pointer, zeroes unread, and tells the conversation (both users) with MESSAGE_READ_UPDATED', async () => {
    const last = (await a1.request('CHAT_MESSAGE', { conversationId: dm.id, clientId: uid(), text: 'read me' })).payload.data.message;
    const pa = a1.nextOf('MESSAGE_READ_UPDATED'); const pb = b1.nextOf('MESSAGE_READ_UPDATED');
    expect((await b1.request('MESSAGE_READ', { conversationId: dm.id, messageId: last.id })).type).toBe('ACK');
    for (const f of [await pa, await pb]) expect(f.payload).toEqual({ conversationId: dm.id, userId: bob.user.id, lastReadMessageId: last.id });
    const r = await ctx.http().get('/api/v1/conversations').set(bearer(bob.accessToken));
    expect(r.body.data.find((c) => c.id === dm.id).unreadCount).toBe(0);
  });
  it('showReadReceipts=false: only the reader\'s own sockets are told', async () => {
    const dave = await registerUser(ctx.http); await befriend(ctx.http, alice, dave);
    const dm2 = await makeDm(ctx.http, alice, dave);
    const d1 = await connect(ctx, dave); const d2 = await connect(ctx, dave);
    const a3 = await connect(ctx, alice);
    await ctx.http().patch('/api/v1/users/me/settings').set(bearer(dave.accessToken)).send({ showReadReceipts: false });
    const m = (await a3.request('CHAT_MESSAGE', { conversationId: dm2.id, clientId: uid(), text: 'hi dave' })).payload.data.message;
    const own = d2.nextOf('MESSAGE_READ_UPDATED');
    await d1.request('MESSAGE_READ', { conversationId: dm2.id, messageId: m.id });
    await own;
    await a3.quiet(250);
    expect(a3.ofType('MESSAGE_READ_UPDATED')).toHaveLength(0);
  });
  it('a duplicate MESSAGE_READ (pointer did not advance) is harmless and not re-broadcast', async () => {
    const last = (await a1.request('CHAT_MESSAGE', { conversationId: dm.id, clientId: uid(), text: 'again' })).payload.data.message;
    await b1.request('MESSAGE_READ', { conversationId: dm.id, messageId: last.id });
    await a1.quiet(150);
    const n = a1.ofType('MESSAGE_READ_UPDATED').length;
    expect((await b1.request('MESSAGE_READ', { conversationId: dm.id, messageId: last.id })).type).toBe('ACK');
    await a1.quiet(200);
    expect(a1.ofType('MESSAGE_READ_UPDATED').length).toBe(n);
  });
});

describe('service events fan-out', () => {
  it('a new group conversation reaches its members as CONVERSATION_UPDATED, and removing a member sends CONVERSATION_REMOVED and cuts delivery', async () => {
    const e = await registerUser(ctx.http); const f = await registerUser(ctx.http);
    await befriend(ctx.http, alice, e); await befriend(ctx.http, alice, f);
    const ec = await connect(ctx, e); const fc = await connect(ctx, f);
    const pe = ec.nextOf('CONVERSATION_UPDATED');
    const group = await makeGroup(ctx.http, alice, [e, f], 'Study');
    expect((await pe).payload.conversation).toMatchObject({ id: group.id });
    expect(await until(() => ctx.wsServer.rooms.size(`conv:${group.id}`) === ctx.wsServer.connections.socketsOf(alice.user.id).length + 2)).toBe(true); // alice's tabs + e + f

    const pm = ec.nextOf('MESSAGE_NEW');
    await a1.request('REGISTER', {}); // a1 learns about the new group's room membership via the service, not the client
    const sent = await a1.request('CHAT_MESSAGE', { conversationId: group.id, clientId: uid(), text: 'group hello' });
    expect(sent.type).toBe('ACK');
    expect((await pm).payload.message.text).toBe('group hello');
    await fc.nextOf('MESSAGE_NEW').catch(() => {});

    const removed = ec.nextOf('CONVERSATION_REMOVED');
    const del = await ctx.http().delete(`/api/v1/conversations/${group.id}/members/${e.user.id}`).set(bearer(alice.accessToken));
    expect(del.status).toBeLessThan(300);
    expect((await removed).payload).toEqual({ conversationId: group.id });
    expect(await until(() => ctx.wsServer.rooms.size(`conv:${group.id}`) === ctx.wsServer.connections.socketsOf(alice.user.id).length + 1)).toBe(true); // alice's tabs + f; e is gone
    const before = ec.ofType('MESSAGE_NEW').length;
    await a1.request('CHAT_MESSAGE', { conversationId: group.id, clientId: uid(), text: 'after removal' });
    await ec.quiet(250);
    expect(ec.ofType('MESSAGE_NEW').length).toBe(before);
    // and the removed user can no longer post over the socket
    expect((await ec.request('CHAT_MESSAGE', { conversationId: group.id, clientId: uid(), text: 'ghost' })).type).toBe('ERROR');
  });

  it('a friend request over HTTP reaches the recipient as FRIEND_UPDATED (their point of view)', async () => {
    const g = await registerUser(ctx.http); const gc = await connect(ctx, g);
    const p = gc.nextOf('FRIEND_UPDATED');
    await ctx.http().post('/api/v1/friends/requests').set(bearer(carol.accessToken)).send({ userId: g.user.id });
    expect((await p).payload).toEqual({ userId: carol.user.id, friendship: 'pending_in' });
  });
});
