// INTEGRATION tests against a REAL MongoDB (see globalSetup). Verifies the provisional models match DATABASE_SCHEMA.md:
// indexes are created (unique / partial / TTL) and the documented constraints actually hold in the database.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../../src/config/db.js';
import * as M from '../../src/models/index.js';
import { pairKey, directKey } from '../../src/utils/ids.js';

beforeAll(async () => {
  await connectDb();
  await Promise.all(Object.values(M).map((m) => m.syncIndexes()));
});
afterAll(async () => { await mongoose.connection.dropDatabase(); await disconnectDb(); });

const oid = () => new mongoose.Types.ObjectId();
const indexes = async (Model) => (await Model.collection.indexes()).filter((i) => i.name !== '_id_');
const find = (list, key) => list.find((i) => JSON.stringify(i.key) === JSON.stringify(key));

describe('indexes match DATABASE_SCHEMA.md', () => {
  it('users', async () => {
    const ix = await indexes(M.User);
    expect(find(ix, { usernameLower: 1 }).unique).toBe(true);
    expect(find(ix, { email: 1 }).unique).toBe(true);
    expect(find(ix, { displayNameLower: 1 })).toBeTruthy();
  });
  it('refreshtokens: unique hash, family lookup, TTL on expiresAt', async () => {
    const ix = await indexes(M.RefreshToken);
    expect(find(ix, { tokenHash: 1 }).unique).toBe(true);
    expect(find(ix, { userId: 1, familyId: 1 })).toBeTruthy();
    expect(find(ix, { expiresAt: 1 }).expireAfterSeconds).toBe(0);
  });
  it('friendships', async () => {
    const ix = await indexes(M.Friendship);
    expect(find(ix, { userA: 1, userB: 1 }).unique).toBe(true);
    expect(find(ix, { userA: 1, status: 1 })).toBeTruthy();
    expect(find(ix, { userB: 1, status: 1 })).toBeTruthy();
  });
  it('conversations: inbox + partial unique directKey', async () => {
    const ix = await indexes(M.Conversation);
    expect(find(ix, { 'members.user': 1, updatedAt: -1 })).toBeTruthy();
    const d = find(ix, { directKey: 1 });
    expect(d.unique).toBe(true);
    expect(d.partialFilterExpression).toEqual({ type: 'direct' });
  });
  it('messages: history + partial unique clientId', async () => {
    const ix = await indexes(M.Message);
    expect(find(ix, { conversationId: 1, _id: -1 })).toBeTruthy();
    const c = find(ix, { conversationId: 1, clientId: 1 });
    expect(c.unique).toBe(true);
    expect(c.partialFilterExpression).toEqual({ clientId: { $type: 'string' } });
  });
  it('activities, focusrooms, roommessages, polls, canvas', async () => {
    expect(find(await indexes(M.Activity), { userId: 1 }).unique).toBe(true);
    expect(find(await indexes(M.Activity), { expiresAt: 1 }).expireAfterSeconds).toBe(0);
    const fr = await indexes(M.FocusRoom);
    for (const k of [{ status: 1, endsAt: 1 }, { 'participants.user': 1, status: 1 }, { invited: 1, status: 1 }, { hostId: 1, status: 1, createdAt: -1 }]) expect(find(fr, k)).toBeTruthy();
    expect(find(fr, { hostId: 1, createdAt: -1 })).toBeFalsy(); // replaced in v1.2
    const rm = await indexes(M.RoomMessage);
    expect(find(rm, { roomId: 1, _id: -1 })).toBeTruthy();
    expect(find(rm, { createdAt: 1 }).expireAfterSeconds).toBe(60 * 60 * 24 * 30);
    expect(find(await indexes(M.Poll), { conversationId: 1, createdAt: -1 })).toBeTruthy();
    expect(find(await indexes(M.CanvasSession), { ownerType: 1, ownerId: 1 }).unique).toBe(true);
    const cs = await indexes(M.CanvasStroke);
    expect(find(cs, { sessionId: 1, epoch: 1, seq: 1 }).unique).toBe(true);
    expect(find(cs, { sessionId: 1, strokeId: 1 }).unique).toBe(true);
    expect(find(cs, { createdAt: 1 }).expireAfterSeconds).toBe(60 * 60 * 24 * 14);
    const up = await indexes(M.Upload);
    expect(find(up, { url: 1 }).unique).toBe(true);
    expect(find(up, { expiresAt: 1 }).expireAfterSeconds).toBe(0);
  });
});

describe('constraints hold in the database', () => {
  const user = (over = {}) => ({ username: 'Alice', email: 'alice@example.com', passwordHash: 'x', displayName: 'Alice A', ...over });

  it('User pre-validate fills the lowercase fields; passwordHash is select:false and hidden in toJSON', async () => {
    const u = await M.User.create(user());
    expect(u.usernameLower).toBe('alice');
    expect(u.displayNameLower).toBe('alice a');
    expect(u.toJSON().passwordHash).toBeUndefined();
    expect(u.toJSON().__v).toBeUndefined();
    expect((await M.User.findById(u._id)).passwordHash).toBeUndefined();
    expect((await M.User.findById(u._id).select('+passwordHash')).passwordHash).toBe('x');
  });
  it('username is case-insensitively unique and email unique', async () => {
    await expect(M.User.create(user({ username: 'ALICE', email: 'other@example.com' }))).rejects.toMatchObject({ code: 11000 });
    await expect(M.User.create(user({ username: 'bob', email: 'ALICE@example.com' }))).rejects.toMatchObject({ code: 11000 });
  });
  it('one friendship doc per normalized pair', async () => {
    const [a, b] = pairKey(oid(), oid());
    await M.Friendship.create({ userA: a, userB: b, requestedBy: a });
    await expect(M.Friendship.create({ userA: a, userB: b, requestedBy: b })).rejects.toMatchObject({ code: 11000 });
    const [lo, hi] = pairKey(oid(), oid());
    await expect(M.Friendship.create({ userA: hi, userB: lo, requestedBy: lo })).rejects.toThrow(/userA < userB/); // v1.2 hook: not normalized
    await expect(M.Friendship.create({ userA: lo, userB: lo, requestedBy: lo })).rejects.toThrow(/userA < userB/); // v1.2 hook: self-pair
    const x = oid(), y = oid();
    expect(pairKey(x, y)).toEqual(pairKey(y, x));
    expect(directKey(x, y)).toBe(directKey(y, x));
  });
  it('one DM per pair (partial unique) while groups may omit directKey', async () => {
    const [a, b] = [oid(), oid()];
    const mk = (over) => ({ createdBy: a, members: [{ user: a }, { user: b }], ...over });
    await M.Conversation.create(mk({ type: 'direct', directKey: directKey(a, b) }));
    await expect(M.Conversation.create(mk({ type: 'direct', directKey: directKey(a, b) }))).rejects.toMatchObject({ code: 11000 });
    await M.Conversation.create(mk({ type: 'group', title: 'g1' }));
    await M.Conversation.create(mk({ type: 'group', title: 'g2' }));
  });
  it('lastMessage is a real object (regression: a nested key named "type" once turned it into a String)', async () => {
    const [a, b] = [oid(), oid()];
    const c = await M.Conversation.create({ type: 'group', title: 'lm', createdBy: a, members: [{ user: a }, { user: b }] });
    const messageId = oid();
    await M.Conversation.updateOne({ _id: c._id }, { $set: { lastMessage: { messageId, senderId: a, preview: 'hi', type: 'text', at: new Date() } } });
    const raw = await M.Conversation.collection.findOne({ _id: c._id });
    expect(raw.lastMessage).toMatchObject({ preview: 'hi', type: 'text' });
    expect(String(raw.lastMessage.messageId)).toBe(String(messageId));
    await M.Conversation.updateOne({ _id: c._id }, { $set: { 'lastMessage.preview': 'edited' } });
    expect((await M.Conversation.findById(c._id).lean()).lastMessage.preview).toBe('edited');
    expect((await M.Conversation.create({ type: 'group', title: 'none', createdBy: a, members: [{ user: a }, { user: b }] })).lastMessage).toBeUndefined();
  });
  it('conversation members must be 2-50', async () => {
    const a = oid();
    await expect(M.Conversation.create({ type: 'group', createdBy: a, members: [{ user: a }] })).rejects.toThrow(/members 2-50/);
    const many = Array.from({ length: 51 }, () => ({ user: oid() }));
    await expect(M.Conversation.create({ type: 'group', createdBy: a, members: many })).rejects.toThrow(/members 2-50/);
  });
  it('message clientId is unique per conversation, only when a string (idempotent sends)', async () => {
    const conversationId = oid();
    await M.Message.create({ conversationId, senderId: oid(), text: 'hi', clientId: 'c-1' });
    await expect(M.Message.create({ conversationId, senderId: oid(), text: 'dup', clientId: 'c-1' })).rejects.toMatchObject({ code: 11000 });
    await M.Message.create({ conversationId: oid(), senderId: oid(), text: 'other conv', clientId: 'c-1' });
    await M.Message.create({ conversationId, senderId: oid(), text: 'no id 1' });
    await M.Message.create({ conversationId, senderId: oid(), text: 'no id 2' });
  });
  it('message limits: <= 5 attachments, text <= 4000', async () => {
    const att = { kind: 'file', url: 'https://x/y', publicId: 'p' };
    await expect(M.Message.create({ conversationId: oid(), text: 'x', attachments: Array(6).fill(att) })).rejects.toThrow(/max 5/);
    await expect(M.Message.create({ conversationId: oid(), text: 'x'.repeat(4001) })).rejects.toThrow();
  });
  it('poll needs 2-8 options; focus room duration 5 min - 4 h; canvas stroke colour/points validated', async () => {
    const base = { conversationId: oid(), creatorId: oid(), question: 'q' };
    await expect(M.Poll.create({ ...base, options: [{ id: 'a', text: 'A' }] })).rejects.toThrow(/2-8 options/);
    await expect(M.FocusRoom.create({ title: 't', hostId: oid(), durationSec: 60 })).rejects.toThrow();
    await expect(M.FocusRoom.create({ title: 't', hostId: oid(), durationSec: 14401 })).rejects.toThrow();
    await M.FocusRoom.create({ title: 't', hostId: oid(), durationSec: 1500 });
    await expect(M.CanvasStroke.create({ sessionId: oid(), authorId: oid(), seq: 1, epoch: 0, color: 'red', size: 4, points: [0, 0] })).rejects.toThrow();
    await expect(M.CanvasStroke.create({ sessionId: oid(), authorId: oid(), seq: 1, epoch: 0, color: '#ff0000', size: 4, strokeId: 'stroke-0001', points: new Array(2002).fill(0) })).rejects.toThrow(/points must be/);
  });
});
