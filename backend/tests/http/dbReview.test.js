// Chat 05 (Database Architect): DATABASE_SCHEMA section 9 test plan, against a REAL MongoDB (see globalSetup). No mocks.
// Covers: concurrency (votes, joins, unread, reactions), duplicate DM race, cursor pagination at 10k messages,
// explain() index use on list queries, and the Canvas v1.1 constraints.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../../src/config/db.js';
import * as M from '../../src/models/index.js';
import { directKey } from '../../src/utils/ids.js';

const oid = () => new mongoose.Types.ObjectId();
beforeAll(async () => { await connectDb(); await Promise.all(Object.values(M).map((m) => m.syncIndexes())); });
afterAll(async () => { await mongoose.connection.dropDatabase(); await disconnectDb(); });

const stages = (plan) => JSON.stringify(plan);
const usesIndex = (plan) => stages(plan).includes('"IXSCAN"') && !stages(plan).includes('"COLLSCAN"');

describe('uniqueness under concurrency', () => {
  it('two concurrent creates of the same DM produce exactly one conversation', async () => {
    const a = oid(); const b = oid(); const key = directKey(a, b);
    const mk = () => M.Conversation.create({ type: 'direct', directKey: key, createdBy: a, members: [{ user: a }, { user: b }] });
    const res = await Promise.allSettled([mk(), mk(), mk(), mk()]);
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await M.Conversation.countDocuments({ directKey: key })).toBe(1);
  });
  it('duplicate clientId in a conversation is rejected, in another conversation allowed', async () => {
    const c1 = oid(); const c2 = oid(); const s = oid();
    await M.Message.create({ conversationId: c1, senderId: s, text: 'a', clientId: 'c-1' });
    await expect(M.Message.create({ conversationId: c1, senderId: s, text: 'b', clientId: 'c-1' })).rejects.toThrow(/E11000/);
    await M.Message.create({ conversationId: c2, senderId: s, text: 'c', clientId: 'c-1' });
    await M.Message.create({ conversationId: c1, senderId: s, text: 'd' }); // no clientId: unlimited
    await M.Message.create({ conversationId: c1, senderId: s, text: 'e' });
  });
});

describe('atomic update patterns the services rely on', () => {
  it('20 simultaneous first votes by one user leave exactly one vote entry', async () => {
    const me = oid();
    const poll = await M.Poll.create({ conversationId: oid(), creatorId: oid(), question: 'q', options: [{ id: 'o1', text: 'a' }, { id: 'o2', text: 'b' }] });
    const vote = async (opt) => {
      for (let i = 0; i < 3; i += 1) {
        const upd = await M.Poll.findOneAndUpdate({ _id: poll._id, closedAt: null, 'votes.user': me }, { $set: { 'votes.$[v].optionIds': [opt] } }, { arrayFilters: [{ 'v.user': me }], new: true });
        if (upd) return upd;
        const ins = await M.Poll.findOneAndUpdate({ _id: poll._id, closedAt: null, 'votes.user': { $ne: me } }, { $push: { votes: { user: me, optionIds: [opt] } } }, { new: true });
        if (ins) return ins;
      }
      return null;
    };
    const out = await Promise.all(Array.from({ length: 20 }, (_, i) => vote(i % 2 ? 'o1' : 'o2')));
    expect(out.every(Boolean)).toBe(true);
    const fresh = await M.Poll.findById(poll._id).lean();
    expect(fresh.votes.filter((v) => String(v.user) === String(me))).toHaveLength(1);
  });
  it('double join of a focus room yields one active participant entry', async () => {
    const me = oid();
    const room = await M.FocusRoom.create({ title: 't', hostId: oid(), durationSec: 1500 });
    const join = async () => (await M.FocusRoom.findOneAndUpdate({ _id: room._id, 'participants.user': me }, { $set: { 'participants.$[p].leftAt': null } }, { arrayFilters: [{ 'p.user': me }], new: true }))
      ?? M.FocusRoom.findOneAndUpdate({ _id: room._id, 'participants.user': { $ne: me } }, { $push: { participants: { user: me } } }, { new: true });
    await Promise.all(Array.from({ length: 10 }, join));
    await join();
    const fresh = await M.FocusRoom.findById(room._id).lean();
    expect(fresh.participants.filter((p) => String(p.user) === String(me))).toHaveLength(1);
  });
  it('50 concurrent sends keep unread counters exact for every non-sender', async () => {
    const [s, r1, r2] = [oid(), oid(), oid()];
    const conv = await M.Conversation.create({ type: 'group', title: 'g', createdBy: s, members: [{ user: s }, { user: r1 }, { user: r2 }] });
    await Promise.all(Array.from({ length: 50 }, () => M.Conversation.updateOne({ _id: conv._id },
      { $inc: { 'members.$[o].unreadCount': 1 } }, { arrayFilters: [{ 'o.user': { $ne: s }, 'o.leftAt': null }], timestamps: false })));
    const fresh = await M.Conversation.findById(conv._id).lean();
    const by = Object.fromEntries(fresh.members.map((m) => [String(m.user), m.unreadCount]));
    expect(by[String(s)]).toBe(0); expect(by[String(r1)]).toBe(50); expect(by[String(r2)]).toBe(50);
  });
  it('concurrent reactions: one entry per emoji, no duplicate users', async () => {
    const msg = await M.Message.create({ conversationId: oid(), senderId: oid(), text: 'x' });
    const users = Array.from({ length: 10 }, oid);
    const add = (u) => M.Message.updateOne({ _id: msg._id, 'reactions.emoji': '👍' }, { $addToSet: { 'reactions.$.users': u } });
    const push = (u) => M.Message.updateOne({ _id: msg._id, 'reactions.emoji': { $ne: '👍' } }, { $push: { reactions: { emoji: '👍', users: [u] } } });
    await Promise.all(users.map(async (u) => { const r = await add(u); if (!r.matchedCount) { const p = await push(u); if (!p.matchedCount) await add(u); } }));
    await Promise.all(users.map(add)); // repeat: idempotent
    const fresh = await M.Message.findById(msg._id).lean();
    expect(fresh.reactions).toHaveLength(1);
    expect(new Set(fresh.reactions[0].users.map(String)).size).toBe(10);
    expect(fresh.reactions[0].users).toHaveLength(10);
  });
});

describe('cursor pagination and index use', () => {
  const conv = oid();
  beforeAll(async () => {
    const docs = Array.from({ length: 10_000 }, (_, i) => ({ conversationId: conv, senderId: oid(), text: `m${i}` }));
    for (let i = 0; i < docs.length; i += 2000) await M.Message.insertMany(docs.slice(i, i + 2000), { ordered: true });
    await M.Message.insertMany(Array.from({ length: 200 }, () => ({ conversationId: oid(), senderId: oid(), text: 'noise' })));
  }, 60_000);

  it('walking 10k messages by _id cursor has no duplicates and no gaps', async () => {
    const seen = []; let before = null;
    for (;;) {
      const filter = { conversationId: conv, ...(before ? { _id: { $lt: before } } : {}) };
      const rows = await M.Message.find(filter).sort({ _id: -1 }).limit(51).lean();
      const page = rows.slice(0, 50); seen.push(...page.map((r) => String(r._id)));
      if (rows.length <= 50) break;
      before = page[page.length - 1]._id;
    }
    expect(seen).toHaveLength(10_000);
    expect(new Set(seen).size).toBe(10_000);
    const total = await M.Message.countDocuments({ conversationId: conv });
    expect(total).toBe(10_000);
  }, 60_000);

  it('history query uses the conversationId+_id index (no COLLSCAN, no in-memory SORT)', async () => {
    const plan = await M.Message.find({ conversationId: conv, _id: { $lt: oid() } }).sort({ _id: -1 }).limit(51).explain('queryPlanner');
    expect(usesIndex(plan.queryPlanner.winningPlan)).toBe(true);
    expect(stages(plan.queryPlanner.winningPlan)).not.toContain('"SORT"');
  });
  it('inbox query uses the members.user+updatedAt index', async () => {
    const me = oid();
    for (let i = 0; i < 30; i += 1) await M.Conversation.create({ type: 'group', title: `g${i}`, createdBy: me, members: [{ user: me }, { user: oid() }] });
    const q = M.Conversation.find({ members: { $elemMatch: { user: me, leftAt: null } } }).sort({ updatedAt: -1 }).limit(50);
    const plan = await q.explain('queryPlanner');
    expect(usesIndex(plan.queryPlanner.winningPlan)).toBe(true);
  });
  it('other list queries use indexes: room messages, friend lists, focus timer recovery, open hosted rooms', async () => {
    const u = oid();
    const plans = await Promise.all([
      M.RoomMessage.find({ roomId: oid() }).sort({ _id: -1 }).limit(50).explain('queryPlanner'),
      M.Friendship.find({ $or: [{ userA: u, status: 'accepted' }, { userB: u, status: 'accepted' }] }).explain('queryPlanner'),
      M.FocusRoom.find({ status: 'running', endsAt: { $lte: new Date() } }).explain('queryPlanner'),
      M.FocusRoom.find({ 'participants.user': u, status: { $in: ['lobby', 'running'] } }).explain('queryPlanner'),
    ]);
    for (const p of plans) expect(usesIndex(p.queryPlanner.winningPlan)).toBe(true);
  });
  it('"open rooms hosted" count uses the hostId+status+createdAt index (v1.2)', async () => {
    const plan = await M.FocusRoom.find({ hostId: oid(), status: { $in: ['lobby', 'running'] } }).explain('queryPlanner');
    expect(stages(plan.queryPlanner.winningPlan)).toContain('hostId_1_status_1_createdAt_-1');
  });
});

describe('Upload registry (v1.2, A5)', () => {
  const doc = (o = {}) => ({ uploaderId: oid(), kind: 'image', url: `https://res.example/${oid()}.png`, publicId: `pulse/u/${oid()}`, ...o });
  it('url is unique; a new row is unused and carries an expiry about 24 h ahead', async () => {
    const d = await M.Upload.create(doc({ url: 'https://res.example/a.png' }));
    expect(d.usedAt).toBeNull();
    expect(d.expiresAt.getTime() - Date.now()).toBeGreaterThan(23.9 * 3600 * 1000);
    await expect(M.Upload.create(doc({ url: 'https://res.example/a.png' }))).rejects.toThrow(/E11000/);
  });
  it('claim is atomic: of 10 concurrent claims by the owner exactly one wins; another user can never claim', async () => {
    const owner = oid();
    const d = await M.Upload.create(doc({ uploaderId: owner }));
    const claim = (by) => M.Upload.findOneAndUpdate({ url: d.url, uploaderId: by, usedAt: null }, { $set: { usedAt: new Date() }, $unset: { expiresAt: 1 } }, { new: true });
    expect(await claim(oid())).toBeNull();
    const res = await Promise.all(Array.from({ length: 10 }, () => claim(owner)));
    expect(res.filter(Boolean)).toHaveLength(1);
    const fresh = await M.Upload.findById(d._id).lean();
    expect(fresh.usedAt).toBeTruthy();
    expect(fresh.expiresAt).toBeUndefined(); // claimed rows are no longer TTL-eligible
  });
});

describe('TTL indexes', () => {
  it('RoomMessage, CanvasStroke, Activity and RefreshToken TTLs are configured as documented', async () => {
    const ttl = async (Model) => (await Model.collection.indexes()).filter((i) => i.expireAfterSeconds !== undefined).map((i) => [Object.keys(i.key)[0], i.expireAfterSeconds]);
    expect(await ttl(M.RoomMessage)).toEqual([['createdAt', 2_592_000]]);
    expect(await ttl(M.CanvasStroke)).toEqual([['createdAt', 1_209_600]]);
    expect(await ttl(M.Activity)).toEqual([['expiresAt', 0]]);
    expect(await ttl(M.RefreshToken)).toEqual([['expiresAt', 0]]);
  });
});

describe('Canvas v1.1 (DATABASE_SCHEMA 3.10)', () => {
  const stroke = (o = {}) => ({ sessionId: oid(), authorId: oid(), strokeId: 'abcd1234', epoch: 0, seq: 1, tool: 'pen', color: '#112233', size: 4, points: [0.1, 0.2, 0.3, 0.4], ...o });

  it('rejects odd-length, out-of-range, empty and oversized point lists; requires strokeId', async () => {
    for (const points of [[0.1], [0.1, 1.5], [], new Array(2002).fill(0.5), [0.1, NaN]]) await expect(M.CanvasStroke.create(stroke({ points }))).rejects.toThrow();
    await expect(M.CanvasStroke.create(stroke({ strokeId: undefined }))).rejects.toThrow();
    await expect(M.CanvasStroke.create(stroke({ strokeId: 'bad id!' }))).rejects.toThrow();
    await M.CanvasStroke.create(stroke({ points: [0.5, 0.5] })); // a single dot is valid
  });
  it('seq is unique per session and epoch, strokeId unique per session; a retried end cannot duplicate a stroke', async () => {
    const sessionId = oid();
    await M.CanvasStroke.create(stroke({ sessionId }));
    await expect(M.CanvasStroke.create(stroke({ sessionId, strokeId: 'zzzz9999' }))).rejects.toThrow(/E11000/);   // same epoch + seq
    await M.CanvasStroke.create(stroke({ sessionId, strokeId: 'epoch-one', epoch: 1 }));                          // same seq, next epoch: fine
    await expect(M.CanvasStroke.create(stroke({ sessionId, seq: 2 }))).rejects.toThrow(/E11000/);                 // same strokeId
    await M.CanvasStroke.create(stroke({ sessionId: oid() }));                                                     // other session: fine
  });
  it('atomic seq allocation: 100 concurrent stroke ends give seq 1..100 with no repeats, and the cap holds at 2000', async () => {
    const s = await M.CanvasSession.create({ ownerType: 'room', ownerId: oid() });
    const alloc = () => M.CanvasSession.findOneAndUpdate({ _id: s._id, epoch: 0, seq: { $lt: 2000 } }, { $inc: { seq: 1 } }, { new: true });
    const res = await Promise.all(Array.from({ length: 100 }, alloc));
    expect(new Set(res.map((r) => r.seq)).size).toBe(100);
    expect(Math.max(...res.map((r) => r.seq))).toBe(100);
    await M.CanvasSession.updateOne({ _id: s._id }, { $set: { seq: 1999 } });
    const last = await Promise.all([alloc(), alloc(), alloc()]);
    expect(last.filter(Boolean)).toHaveLength(1); // only one of three gets the last slot
  });
  it('a stroke that finishes after a clear is rejected by the epoch guard', async () => {
    const s = await M.CanvasSession.create({ ownerType: 'conversation', ownerId: oid() });
    const startedEpoch = s.epoch;
    await M.CanvasSession.updateOne({ _id: s._id }, { $inc: { epoch: 1 }, $set: { seq: 0, clearedAt: new Date() } }); // CANVAS_CLEAR
    const late = await M.CanvasSession.findOneAndUpdate({ _id: s._id, epoch: startedEpoch, seq: { $lt: 2000 } }, { $inc: { seq: 1 } }, { new: true });
    expect(late).toBeNull();
  });
  it('RACE: a stroke that allocates a slot, then loses to a clear, never shows in replay and never blocks new strokes', async () => {
    const s = await M.CanvasSession.create({ ownerType: 'conversation', ownerId: oid() });
    const sessionId = s._id;
    const alloc = (epoch) => M.CanvasSession.findOneAndUpdate({ _id: sessionId, epoch, seq: { $lt: 2000 } }, { $inc: { seq: 1 } }, { new: true });
    const clear = async () => {
      const c = await M.CanvasSession.findOneAndUpdate({ _id: sessionId }, { $inc: { epoch: 1 }, $set: { seq: 0, clearedAt: new Date() } }, { new: true });
      await M.CanvasStroke.deleteMany({ sessionId, epoch: { $lt: c.epoch } });
      return c;
    };
    const persist = async (strokeId, epoch) => { const a = await alloc(epoch); return a && M.CanvasStroke.create({ sessionId, authorId: oid(), strokeId, epoch: a.epoch, seq: a.seq, points: [0.1, 0.2] }); };

    const slow = await alloc(0);                         // stroke A: allocated (epoch 0, seq 1) ...
    expect(slow.seq).toBe(1);
    const cleared = await clear();                       // ... canvas cleared here (epoch 1, seq 0, deleteMany) ...
    await M.CanvasStroke.create({ sessionId, authorId: oid(), strokeId: 'stale-A-1', epoch: slow.epoch, seq: slow.seq, points: [0.1, 0.2] }); // ... A is created afterwards, in epoch 0
    await persist('fresh-B-1', cleared.epoch);           // new strokes in epoch 1 take seq 1, 2: no collision with the stale seq 1
    await persist('fresh-B-2', cleared.epoch);
    const replay = await M.CanvasStroke.find({ sessionId, epoch: cleared.epoch }).sort({ seq: 1 }).lean();
    expect(replay.map((r) => r.strokeId)).toEqual(['fresh-B-1', 'fresh-B-2']);
    expect(replay.map((r) => r.seq)).toEqual([1, 2]);
    await clear();                                       // the next clear removes the stale epoch-0 stroke
    expect(await M.CanvasStroke.countDocuments({ sessionId })).toBe(0);
    expect(await alloc(cleared.epoch)).toBeNull();       // and a stroke still holding epoch 1 is now rejected at allocation
  });
  it('one session per owner', async () => {
    const ownerId = oid();
    await M.CanvasSession.create({ ownerType: 'room', ownerId });
    await expect(M.CanvasSession.create({ ownerType: 'room', ownerId })).rejects.toThrow(/E11000/);
    await M.CanvasSession.create({ ownerType: 'conversation', ownerId });
  });
});
