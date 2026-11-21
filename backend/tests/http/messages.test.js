// INTEGRATION (real MongoDB): message.service (the functions Chat 04's WebSocket handlers call) and the HTTP history/read endpoints.
// File storage is the only mocked piece (fake adapter); the database, services and Express app are real.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestApp, resetDb, registerUser, befriend, makeDm, makeGroup, bearer, captureEvents, createFakeStorage, oid, mongoose } from '../helpers/app.js';
import { Conversation } from '../../src/models/Conversation.js';
import { Message } from '../../src/models/Message.js';
import { User } from '../../src/models/User.js';
import { EVENTS } from '../../src/utils/events.js';
import { setStorage } from '../../src/services/storage/index.js';
import * as svc from '../../src/services/message.service.js';

let t;
let storage;
const http = () => t.http();
const C = '/api/v1/conversations';
beforeAll(async () => { t = await startTestApp(); });
afterAll(async () => { await mongoose.connection.dropDatabase(); await t.stop(); });
beforeEach(async () => { await resetDb(); storage = createFakeStorage(); setStorage(storage); });

const users = (n) => Promise.all(Array.from({ length: n }, () => registerUser(http)));
async function pair() {
  const [a, b] = await users(2);
  await befriend(http, a, b);
  const dm = await makeDm(http, a, b);
  return { a, b, dm };
}
let seq = 0;
const send = (u, convId, extra = {}) => svc.sendMessage(u.user.id, { conversationId: convId, clientId: `cid-${Date.now()}-${seq += 1}-xx`, text: 'hello', ...extra });
const member = async (convId, u) => (await Conversation.findById(convId).lean()).members.find((m) => String(m.user) === u.user.id);
const uploadVia = async (u, name = 'p.png') => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
  const r = await http().post('/api/v1/uploads').set(bearer(u.accessToken)).attach('file', png, name);
  expect(r.status).toBe(201);
  return r.body.data;
};

describe('sendMessage', () => {
  it('stores the message, updates lastMessage and updatedAt, and increments unread only for the other member', async () => {
    const { a, b, dm } = await pair();
    const res = await send(a, dm.id, { text: '  hi there  ' });
    expect(res.duplicate).toBe(false);
    expect(res.memberIds.sort()).toEqual([a.user.id, b.user.id].sort());
    expect(res.message).toMatchObject({ conversationId: dm.id, senderId: a.user.id, type: 'text', text: 'hi there', attachments: [], replyTo: null, pollId: null, reactions: [], editedAt: null, deletedAt: null });
    expect(res.message.clientId).toMatch(/^cid-/);
    const conv = await Conversation.findById(dm.id).lean();
    expect(conv.lastMessage).toMatchObject({ preview: 'hi there', type: 'text' });
    expect(String(conv.lastMessage.messageId)).toBe(res.message.id);
    expect(conv.members.find((m) => String(m.user) === a.user.id).unreadCount).toBe(0);
    expect(conv.members.find((m) => String(m.user) === b.user.id).unreadCount).toBe(1);
    expect(res.message.createdAt).toBeInstanceOf(Date);
  });

  it('is idempotent on clientId: a retry returns the original (duplicate: true) and does not double-count unread', async () => {
    const { a, b, dm } = await pair();
    const first = await svc.sendMessage(a.user.id, { conversationId: dm.id, clientId: 'retry-key-0001', text: 'once' });
    const again = await svc.sendMessage(a.user.id, { conversationId: dm.id, clientId: 'retry-key-0001', text: 'once' });
    expect(again.duplicate).toBe(true);
    expect(again.message.id).toBe(first.message.id);
    expect(await Message.countDocuments({ conversationId: dm.id })).toBe(1);
    expect((await member(dm.id, b)).unreadCount).toBe(1);
  });

  it('race: 12 simultaneous sends with the same clientId create exactly one message and one unread', async () => {
    const { a, b, dm } = await pair();
    const rs = await Promise.all(Array.from({ length: 12 }, () => svc.sendMessage(a.user.id, { conversationId: dm.id, clientId: 'race-key-00001', text: 'x' })));
    expect(rs.filter((r) => !r.duplicate)).toHaveLength(1);
    expect(new Set(rs.map((r) => r.message.id)).size).toBe(1);
    expect(await Message.countDocuments({ conversationId: dm.id })).toBe(1);
    expect((await member(dm.id, b)).unreadCount).toBe(1);
  });

  it('race: 25 concurrent sends from both sides keep unread counts exactly consistent', async () => {
    const { a, b, dm } = await pair();
    const fromA = Array.from({ length: 15 }, () => send(a, dm.id));
    const fromB = Array.from({ length: 10 }, () => send(b, dm.id));
    await Promise.all([...fromA, ...fromB]);
    expect(await Message.countDocuments({ conversationId: dm.id })).toBe(25);
    expect((await member(dm.id, a)).unreadCount).toBe(10); // what b sent
    expect((await member(dm.id, b)).unreadCount).toBe(15); // what a sent
  });

  it('same clientId: fine across conversations; reuse by another member of the SAME conversation is a clean CONFLICT (index is conversationId+clientId per schema)', async () => {
    const { a, b, dm } = await pair();
    const c = (await users(1))[0];
    await befriend(http, a, c);
    const dm2 = await makeDm(http, a, c);
    await svc.sendMessage(a.user.id, { conversationId: dm.id, clientId: 'shared-key-01', text: '1' });
    await expect(svc.sendMessage(b.user.id, { conversationId: dm.id, clientId: 'shared-key-01', text: '2' })).rejects.toMatchObject({ status: 409 });
    await svc.sendMessage(a.user.id, { conversationId: dm2.id, clientId: 'shared-key-01', text: '3' });
    expect(await Message.countDocuments({})).toBe(2);
  });

  it('members who muted still accumulate unread; members who left do not', async () => {
    const [o, a, b] = await users(3);
    await befriend(http, o, a); await befriend(http, o, b);
    const g = await makeGroup(http, o, [a, b]);
    await http().patch(`${C}/${g.id}/mute`).set(bearer(a.accessToken)).send({ mutedUntil: new Date(Date.now() + 1e6).toISOString() });
    await http().delete(`${C}/${g.id}/members/${b.user.id}`).set(bearer(b.accessToken));
    await send(o, g.id);
    expect((await member(g.id, a)).unreadCount).toBe(1);
    expect((await member(g.id, b)).unreadCount).toBe(0);
  });

  it('authorization: non-members get NOT_FOUND; DMs need a friendship and no block', async () => {
    const { a, b, dm } = await pair();
    const outsider = (await users(1))[0];
    await expect(send(outsider, dm.id)).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    await expect(send(a, oid().toString())).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(send(a, 'not-an-id')).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await http().delete(`/api/v1/friends/${b.user.id}`).set(bearer(a.accessToken)); // unfriend
    await expect(send(a, dm.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(send(b, dm.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await Message.countDocuments({})).toBe(0);

    await befriend(http, a, b);
    await http().post(`/api/v1/friends/${a.user.id}/block`).set(bearer(b.accessToken));
    await expect(send(a, dm.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('validation: needs text or attachments, text <= 4000, <= 5 attachments, bad clientId, bad replyTo', async () => {
    const { a, dm } = await pair();
    const bad = (extra) => svc.sendMessage(a.user.id, { conversationId: dm.id, clientId: `valid-key-${seq += 1}-abc`, ...extra });
    await expect(bad({ text: '   ' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(bad({ text: 'x'.repeat(4001) })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((await bad({ text: 'x'.repeat(4000) })).message.text).toHaveLength(4000);
    await expect(svc.sendMessage(a.user.id, { conversationId: dm.id, clientId: 'short', text: 'hi' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(bad({ text: 'hi', attachments: Array(6).fill({}) })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(bad({ text: 'hi', replyTo: oid().toString() })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('replies: replyTo must be in the same conversation; history shows a ReplyPreview (<= 120 chars)', async () => {
    const { a, b, dm } = await pair();
    const [c] = await users(1);
    await befriend(http, a, c);
    const other = await makeDm(http, a, c);
    const long = await send(b, dm.id, { text: 'y'.repeat(300) });
    const foreign = await send(a, other.id, { text: 'elsewhere' });
    await expect(send(a, dm.id, { replyTo: foreign.message.id })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const reply = await send(a, dm.id, { text: 'answer', replyTo: long.message.id });
    const hist = await http().get(`${C}/${dm.id}/messages`).set(bearer(a.accessToken));
    const item = hist.body.data.find((m) => m.id === reply.message.id);
    expect(item.replyTo).toMatchObject({ id: long.message.id, senderId: b.user.id, type: 'text' });
    expect(item.replyTo.text).toHaveLength(120);
  });
});

describe('attachments', () => {
  it('upload then send round-trips; the stored record keeps publicId server-side and the API never exposes it', async () => {
    const { a, dm } = await pair();
    const att = await uploadVia(a);
    expect(att.publicId).toBeUndefined();
    const res = await send(a, dm.id, { text: '', attachments: [att] });
    expect(res.message).toMatchObject({ type: 'image', text: '' });
    expect(res.message.attachments[0]).toMatchObject({ kind: 'image', url: att.url, mime: 'image/png' });
    expect(res.message.attachments[0].publicId).toBeUndefined();
    const stored = await Message.findById(res.message.id).lean();
    expect(stored.attachments[0].publicId).toMatch(new RegExp(`^pulse/${a.user.id}/`));
    expect((await Conversation.findById(dm.id).lean()).lastMessage.preview).toBe('Photo');
  });

  it("rejects another user's upload, foreign hosts, forged paths, wrong kind, oversize and disallowed mime", async () => {
    const { a, b, dm } = await pair();
    const mine = await uploadVia(a);
    const theirs = await uploadVia(b);
    const attempt = (att) => send(a, dm.id, { attachments: [att] });
    await expect(attempt(theirs)).rejects.toMatchObject({ code: 'FORBIDDEN' });                                        // someone else's file
    await expect(attempt({ ...mine, url: mine.url.replace('res.cloudinary.com', 'evil.example') })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(attempt({ ...mine, url: mine.url.replace('/testcloud/', '/othercloud/') })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(attempt({ ...mine, url: mine.url.replace(a.user.id, b.user.id) })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(attempt({ ...mine, url: `${mine.url}/../../x` })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(attempt({ ...mine, kind: 'file' })).rejects.toMatchObject({ code: 'FORBIDDEN' });                      // image URL claimed as raw file
    await expect(attempt({ ...mine, size: 10 * 1024 * 1024 + 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(attempt({ ...mine, mime: 'application/x-msdownload' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(attempt(null)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await Message.countDocuments({})).toBe(0);
  });
});

describe('GET history', () => {
  it('120 messages: newest first, 50/page, no duplicates or gaps, correct hasMore/nextCursor', async () => {
    const { a, b, dm } = await pair();
    const docs = Array.from({ length: 120 }, (_, i) => ({ conversationId: dm.id, senderId: i % 2 ? a.user.id : b.user.id, text: `m${i}`, _id: new mongoose.Types.ObjectId(Math.floor(Date.now() / 1000) + i, 0, 0) }));
    const inserted = await Message.collection.insertMany(docs.map((d) => ({ ...d, conversationId: new mongoose.Types.ObjectId(d.conversationId), senderId: new mongoose.Types.ObjectId(d.senderId), type: 'text', attachments: [], reactions: [], createdAt: new Date(), updatedAt: new Date() })));
    expect(inserted.insertedCount).toBe(120);

    const seen = [];
    let before;
    let pages = 0;
    for (;;) {
      const r = await http().get(`${C}/${dm.id}/messages?limit=50${before ? `&before=${before}` : ''}`).set(bearer(a.accessToken));
      expect(r.status).toBe(200);
      seen.push(...r.body.data.map((m) => m.text));
      pages += 1;
      if (!r.body.meta.hasMore) { expect(r.body.meta.nextCursor).toBeNull(); break; }
      before = r.body.meta.nextCursor;
      expect(before).toBe(r.body.data[r.body.data.length - 1].id);
    }
    expect(pages).toBe(3);
    expect(seen).toHaveLength(120);
    expect(new Set(seen).size).toBe(120);
    expect(seen).toEqual(Array.from({ length: 120 }, (_, i) => `m${119 - i}`)); // strictly newest first, no gaps
  });

  it('default limit 30, max 50, invalid cursor rejected, a cursor beyond the end is just empty', async () => {
    const { a, dm } = await pair();
    for (let i = 0; i < 35; i += 1) await send(a, dm.id, { text: `n${i}` });
    const r = await http().get(`${C}/${dm.id}/messages`).set(bearer(a.accessToken));
    expect(r.body.data).toHaveLength(30);
    expect(r.body.meta.hasMore).toBe(true);
    expect((await http().get(`${C}/${dm.id}/messages?limit=51`).set(bearer(a.accessToken))).status).toBe(400);
    expect((await http().get(`${C}/${dm.id}/messages?limit=0`).set(bearer(a.accessToken))).status).toBe(400);
    expect((await http().get(`${C}/${dm.id}/messages?before=zzz`).set(bearer(a.accessToken))).status).toBe(400);
    const last = r.body.data[29].id;
    expect((await http().get(`${C}/${dm.id}/messages?before=${last}`).set(bearer(a.accessToken))).body.data).toHaveLength(5);
  });

  it('single fetch works for members, is 404 across conversations and for non-members', async () => {
    const { a, b, dm } = await pair();
    const outsider = (await users(1))[0];
    const m = await send(a, dm.id);
    expect((await http().get(`${C}/${dm.id}/messages/${m.message.id}`).set(bearer(b.accessToken))).body.data.id).toBe(m.message.id);
    expect((await http().get(`${C}/${dm.id}/messages/${m.message.id}`).set(bearer(outsider.accessToken))).status).toBe(404);
    const [c] = await users(1);
    await befriend(http, a, c);
    const other = await makeDm(http, a, c);
    expect((await http().get(`${C}/${other.id}/messages/${m.message.id}`).set(bearer(a.accessToken))).status).toBe(404);
    expect((await http().get(`${C}/${dm.id}/messages/${oid()}`).set(bearer(a.accessToken))).status).toBe(404);
  });

  it('list queries use their indexes (explain: IXSCAN, no collection scan)', async () => {
    const { a, dm } = await pair();
    for (let i = 0; i < 5; i += 1) await send(a, dm.id);
    const plan = async (q) => JSON.stringify((await q.explain('queryPlanner')).queryPlanner.winningPlan);
    const history = await plan(Message.find({ conversationId: dm.id, _id: { $lt: oid() } }).sort({ _id: -1 }).limit(31));
    expect(history).toContain('IXSCAN');
    expect(history).not.toContain('COLLSCAN');
    expect(history).not.toContain('"SORT"'); // sort is satisfied by the index
    const inbox = await plan(Conversation.find({ members: { $elemMatch: { user: a.user.id, leftAt: null } } }).sort({ updatedAt: -1, _id: -1 }).limit(31));
    expect(inbox).toContain('IXSCAN');
    expect(inbox).not.toContain('COLLSCAN');
  });
});

describe('editMessage', () => {
  it('sender only, text only, within 24 h; updates editedAt and the lastMessage preview', async () => {
    const { a, b, dm } = await pair();
    const m = await send(a, dm.id, { text: 'typo' });
    await expect(svc.editMessage(b.user.id, m.message.id, 'hack')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const ok = await svc.editMessage(a.user.id, m.message.id, ' fixed ');
    expect(ok).toMatchObject({ conversationId: dm.id, messageId: m.message.id, text: 'fixed' });
    expect(ok.editedAt).toBeInstanceOf(Date);
    expect((await Conversation.findById(dm.id).lean()).lastMessage.preview).toBe('fixed');
    expect((await http().get(`${C}/${dm.id}/messages/${m.message.id}`).set(bearer(a.accessToken))).body.data.editedAt).toBeTruthy();

    await expect(svc.editMessage(a.user.id, m.message.id, '   ')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(svc.editMessage(a.user.id, m.message.id, 'x'.repeat(4001))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(svc.editMessage(a.user.id, oid().toString(), 'x')).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await Message.collection.updateOne({ _id: new mongoose.Types.ObjectId(m.message.id) }, { $set: { createdAt: new Date(Date.now() - 24 * 3600_000 - 1000) } });
    await expect(svc.editMessage(a.user.id, m.message.id, 'too late')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const fresh = await send(a, dm.id, { text: 'recent' });
    await Message.collection.updateOne({ _id: new mongoose.Types.ObjectId(fresh.message.id) }, { $set: { createdAt: new Date(Date.now() - 23 * 3600_000) } });
    expect((await svc.editMessage(a.user.id, fresh.message.id, 'still ok')).text).toBe('still ok'); // inside the window
  });

  it('non-text messages cannot be edited; non-members get NOT_FOUND', async () => {
    const { a, dm } = await pair();
    const img = await send(a, dm.id, { text: '', attachments: [await uploadVia(a)] });
    await expect(svc.editMessage(a.user.id, img.message.id, 'caption')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const outsider = (await users(1))[0];
    const m = await send(a, dm.id);
    await expect(svc.editMessage(outsider.user.id, m.message.id, 'x')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('deleteMessage', () => {
  it('blanks content, removes files from storage, keeps the slot, and is idempotent', async () => {
    const { a, b, dm } = await pair();
    const att = await uploadVia(a);
    const m = await send(a, dm.id, { text: 'secret', attachments: [att] });
    await expect(svc.deleteMessage(b.user.id, m.message.id)).rejects.toMatchObject({ code: 'FORBIDDEN' }); // not the sender, and DMs have no admins
    const ev = await svc.deleteMessage(a.user.id, m.message.id);
    expect(ev).toMatchObject({ conversationId: dm.id, messageId: m.message.id });
    expect(storage.destroyed).toHaveLength(1);
    expect(storage.destroyed[0].publicId).toMatch(new RegExp(`^pulse/${a.user.id}/`));
    const raw = await Message.findById(m.message.id).lean();
    expect(raw).toMatchObject({ text: '', attachments: [] });
    expect(raw.deletedAt).toBeTruthy();
    const api = (await http().get(`${C}/${dm.id}/messages`).set(bearer(b.accessToken))).body.data[0];
    expect(api).toMatchObject({ id: m.message.id, text: '', attachments: [] });
    expect(api.deletedAt).toBeTruthy();
    expect((await Conversation.findById(dm.id).lean()).lastMessage.preview).toBe('Message deleted');
    await svc.deleteMessage(a.user.id, m.message.id); // again: no error, no second storage call
    expect(storage.destroyed).toHaveLength(1);
    await expect(svc.editMessage(a.user.id, m.message.id, 'revive')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(svc.setReaction(b.user.id, m.message.id, '👍', 'add')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('group admins and the owner can delete others\' messages; plain members cannot', async () => {
    const [o, a, b] = await users(3);
    await befriend(http, o, a); await befriend(http, o, b);
    const g = await makeGroup(http, o, [a, b]);
    const fromA = await send(a, g.id);
    await expect(svc.deleteMessage(b.user.id, fromA.message.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await svc.deleteMessage(o.user.id, fromA.message.id)).messageId).toBe(fromA.message.id);
    await Conversation.updateOne({ _id: g.id, 'members.user': b.user.id }, { $set: { 'members.$.role': 'admin' } });
    const fromA2 = await send(a, g.id);
    expect((await svc.deleteMessage(b.user.id, fromA2.message.id)).messageId).toBe(fromA2.message.id);
  });
});

describe('reactions', () => {
  it('add and remove, one entry per user per emoji, empty entries disappear', async () => {
    const { a, b, dm } = await pair();
    const m = await send(a, dm.id);
    let r = await svc.setReaction(a.user.id, m.message.id, '👍', 'add');
    expect(r.reactions).toEqual([{ emoji: '👍', userIds: [a.user.id] }]);
    r = await svc.setReaction(b.user.id, m.message.id, '👍', 'add');
    expect(r.reactions[0].userIds.sort()).toEqual([a.user.id, b.user.id].sort());
    r = await svc.setReaction(b.user.id, m.message.id, '👍', 'add'); // duplicate add is a no-op
    expect(r.reactions[0].userIds).toHaveLength(2);
    r = await svc.setReaction(a.user.id, m.message.id, '❤️', 'add');
    expect(r.reactions.map((x) => x.emoji).sort()).toEqual(['❤️', '👍'].sort());
    r = await svc.setReaction(a.user.id, m.message.id, '❤️', 'remove');
    expect(r.reactions.map((x) => x.emoji)).toEqual(['👍']); // empty entry removed
    r = await svc.setReaction(a.user.id, m.message.id, '🎉', 'remove'); // removing something never added is harmless
    expect(r.reactions).toHaveLength(1);
    const api = (await http().get(`${C}/${dm.id}/messages/${m.message.id}`).set(bearer(a.accessToken))).body.data;
    expect(api.reactions).toEqual([{ emoji: '👍', userIds: expect.any(Array) }]);
  });

  it('accepts a single emoji (including skin tones, flags, ZWJ sequences and keycaps) and rejects everything else', async () => {
    const { a, dm } = await pair();
    const m = await send(a, dm.id);
    for (const e of ['👍🏽', '🇮🇳', '👨‍👩‍👧', '1️⃣', '😀']) await expect(svc.setReaction(a.user.id, m.message.id, e, 'add')).resolves.toBeTruthy();
    for (const e of ['', 'a', 'ab', '👍👍', ':smile:', '<b>', ' ', 'x'.repeat(40)]) {
      await expect(svc.setReaction(a.user.id, m.message.id, e, 'add')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    }
    await expect(svc.setReaction(a.user.id, m.message.id, '👍', 'toggle')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('race: 10 users react with the same emoji at once => one entry with 10 distinct users', async () => {
    const [o, ...rest] = await users(10);
    for (const u of rest) await befriend(http, o, u);
    const g = await makeGroup(http, o, rest, 'Crowd');
    const m = await send(o, g.id);
    await Promise.all([o, ...rest].map((u) => svc.setReaction(u.user.id, m.message.id, '🔥', 'add')));
    const raw = await Message.findById(m.message.id).lean();
    expect(raw.reactions).toHaveLength(1);
    expect(new Set(raw.reactions[0].users.map(String)).size).toBe(10);
  });

  it('limit: at most 20 distinct emoji per message even under concurrency', async () => {
    const { a, dm } = await pair();
    const m = await send(a, dm.id);
    const emoji = ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '😋', '😛', '😜', '🤪', '😝'];
    expect(emoji).toHaveLength(25);
    const results = await Promise.allSettled(emoji.map((e) => svc.setReaction(a.user.id, m.message.id, e, 'add')));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(20);
    expect(results.filter((r) => r.status === 'rejected').every((r) => r.reason.code === 'VALIDATION_ERROR')).toBe(true);
    expect((await Message.findById(m.message.id).lean()).reactions).toHaveLength(20);
  });
});

describe('read pointer (POST /read, WS MESSAGE_READ) and read-state', () => {
  it('moves forward only, zeroes unread, emits message:read once per advance, never regresses', async () => {
    const { a, b, dm } = await pair();
    const m1 = await send(a, dm.id);
    const m2 = await send(a, dm.id);
    const m3 = await send(a, dm.id);
    expect((await member(dm.id, b)).unreadCount).toBe(3);
    const ev = captureEvents(EVENTS.MESSAGE_READ);
    const r2 = await http().post(`${C}/${dm.id}/read`).set(bearer(b.accessToken)).send({ messageId: m2.message.id });
    expect(r2.status).toBe(200);
    expect(r2.body.data).toEqual({ lastReadMessageId: m2.message.id });
    expect((await member(dm.id, b)).unreadCount).toBe(0);
    await http().post(`${C}/${dm.id}/read`).set(bearer(b.accessToken)).send({ messageId: m1.message.id }); // older: ignored
    expect(String((await member(dm.id, b)).lastReadMessageId)).toBe(m2.message.id);
    await http().post(`${C}/${dm.id}/read`).set(bearer(b.accessToken)).send({ messageId: m2.message.id }); // same: ignored
    await http().post(`${C}/${dm.id}/read`).set(bearer(b.accessToken)).send({ messageId: m3.message.id });
    ev.stop();
    expect(ev.got).toEqual([
      { conversationId: dm.id, userId: b.user.id, lastReadMessageId: m2.message.id },
      { conversationId: dm.id, userId: b.user.id, lastReadMessageId: m3.message.id },
    ]);
    const mine = (await http().get(`${C}/${dm.id}`).set(bearer(b.accessToken))).body.data;
    expect(mine).toMatchObject({ unreadCount: 0, lastReadMessageId: m3.message.id });
    expect((await http().get(`${C}/${dm.id}`).set(bearer(a.accessToken))).body.data.lastReadMessageId).toBeNull(); // personal values
  });

  it('race: 10 simultaneous reads leave the pointer on the newest message', async () => {
    const { a, b, dm } = await pair();
    const ms = [];
    for (let i = 0; i < 10; i += 1) ms.push(await send(a, dm.id));
    await Promise.all(ms.map((m) => svc.markRead(b.user.id, dm.id, m.message.id)));
    expect(String((await member(dm.id, b)).lastReadMessageId)).toBe(ms[9].message.id);
    expect((await member(dm.id, b)).unreadCount).toBe(0);
  });

  it('rejects messages from other conversations, malformed ids and non-members', async () => {
    const { a, b, dm } = await pair();
    const [c] = await users(1);
    await befriend(http, a, c);
    const other = await makeDm(http, a, c);
    const foreign = await send(a, other.id);
    expect((await http().post(`${C}/${dm.id}/read`).set(bearer(b.accessToken)).send({ messageId: foreign.message.id })).status).toBe(404);
    expect((await http().post(`${C}/${dm.id}/read`).set(bearer(b.accessToken)).send({ messageId: 'bad' })).status).toBe(400);
    expect((await http().post(`${C}/${dm.id}/read`).set(bearer(c.accessToken)).send({ messageId: foreign.message.id })).status).toBe(404);
  });

  it('read-state lists members\' pointers and hides users who turned read receipts off', async () => {
    const [o, a, b] = await users(3);
    await befriend(http, o, a); await befriend(http, o, b);
    const g = await makeGroup(http, o, [a, b]);
    const m = await send(o, g.id);
    await svc.markRead(a.user.id, g.id, m.message.id);
    await svc.markRead(b.user.id, g.id, m.message.id);
    await User.updateOne({ _id: b.user.id }, { 'settings.showReadReceipts': false });
    const asO = (await http().get(`${C}/${g.id}/read-state`).set(bearer(o.accessToken))).body.data;
    expect(asO.map((x) => x.userId).sort()).toEqual([o.user.id, a.user.id].sort());
    expect(asO.find((x) => x.userId === a.user.id).lastReadMessageId).toBe(m.message.id);
    const asB = (await http().get(`${C}/${g.id}/read-state`).set(bearer(b.accessToken))).body.data;
    expect(asB.map((x) => x.userId)).toContain(b.user.id); // you always see your own
    const outsider = (await users(1))[0];
    expect((await http().get(`${C}/${g.id}/read-state`).set(bearer(outsider.accessToken))).status).toBe(404);
  });
});
