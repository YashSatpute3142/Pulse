// INTEGRATION (real MongoDB + Express). No mocks. WS-facing write services are called directly, as Chat 04's handlers will.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestApp, resetDb, registerUser, befriend, makeDm, makeGroup, bearer, oid, mongoose } from '../helpers/app.js';
import { Poll } from '../../src/models/Poll.js';
import { Message } from '../../src/models/Message.js';
import { Conversation } from '../../src/models/Conversation.js';
import * as svc from '../../src/services/poll.service.js';

let t;
const http = () => t.http();
beforeAll(async () => { t = await startTestApp(); });
afterAll(async () => { await mongoose.connection.dropDatabase(); await t.stop(); });
beforeEach(async () => { await resetDb(); });
const users = (n) => Promise.all(Array.from({ length: n }, () => registerUser(http)));
const id = (u) => u.user.id;
const getPoll = (u, pid) => http().get(`/api/v1/polls/${pid}`).set(bearer(u.accessToken));
async function group(n = 3) {
  const [owner, ...rest] = await users(n);
  for (const u of rest) await befriend(http, owner, u);
  const g = await makeGroup(http, owner, rest);
  return { owner, rest, g };
}
const mk = (u, g, extra = {}) => svc.createPoll(id(u), { conversationId: g.id, question: 'Lunch?', options: ['Pizza', 'Sushi', 'Salad'], ...extra });

describe('createPoll', () => {
  it('creates the poll and its message together; the contract shape has server-made option ids and zero counts', async () => {
    const { owner, rest, g } = await group();
    const { poll, message, memberIds } = await mk(owner, g, { multiple: true, closesInMin: 60 });
    expect(poll).toMatchObject({ conversationId: g.id, creatorId: id(owner), question: 'Lunch?', multiple: true, anonymous: false, closedAt: null, myVote: [] });
    expect(poll.options).toEqual([{ id: 'o1', text: 'Pizza' }, { id: 'o2', text: 'Sushi' }, { id: 'o3', text: 'Salad' }]);
    expect(poll.counts).toEqual({ o1: 0, o2: 0, o3: 0 });
    expect(new Date(poll.closesAt) - Date.now()).toBeGreaterThan(59 * 60_000);
    expect(poll.messageId).toBe(message.id);
    expect(message).toMatchObject({ conversationId: g.id, senderId: id(owner), type: 'poll', pollId: poll.id, text: 'Lunch?' });
    expect(memberIds.sort()).toEqual([id(owner), ...rest.map(id)].sort());
    const conv = await Conversation.findById(g.id).lean();
    expect(conv.lastMessage).toMatchObject({ type: 'poll', preview: 'Poll: Lunch?' });
    expect(conv.members.find((m) => String(m.user) === id(rest[0])).unreadCount).toBe(1);
    expect(conv.members.find((m) => String(m.user) === id(owner)).unreadCount).toBe(0);
    const hist = await http().get(`/api/v1/conversations/${g.id}/messages`).set(bearer(rest[0].accessToken));
    expect(hist.body.data[0]).toMatchObject({ type: 'poll', pollId: poll.id });
  });
  it('validates question, options, flags and closing time; non-members and blocked DMs are refused', async () => {
    const { owner, g } = await group();
    const bad = (extra) => mk(owner, g, extra);
    await expect(bad({ question: ' ' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(bad({ question: 'x'.repeat(201) })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    for (const options of [['one'], Array(9).fill(0).map((_, i) => `o${i}`), ['a', ''], ['a', 'x'.repeat(81)], ['a', 'A'], ['a', 5], 'ab', undefined]) {
      await expect(bad({ options })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    }
    await expect(bad({ options: Array(8).fill(0).map((_, i) => `o${i}`) })).resolves.toBeTruthy();
    for (const closesInMin of [0, -1, 1.5, 10081]) await expect(bad({ closesInMin })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(bad({ multiple: 'yes' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const [out] = await users(1);
    await expect(mk(out, g)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const [a, b] = await users(2);
    await befriend(http, a, b);
    const dm = await makeDm(http, a, b);
    await http().delete(`/api/v1/friends/${id(b)}`).set(bearer(a.accessToken));
    await expect(mk(a, dm)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await Poll.countDocuments({ conversationId: dm.id })).toBe(0);
    expect(await Message.countDocuments({ conversationId: dm.id })).toBe(0);
  });
});

describe('GET /polls/:id', () => {
  it('members see counts and only their OWN vote; outsiders and unknown ids get 404; voters are never exposed', async () => {
    const { owner, rest, g } = await group();
    const { poll } = await mk(owner, g, { anonymous: true });
    await svc.vote(id(rest[0]), poll.id, ['o2']);
    await svc.vote(id(rest[1]), poll.id, ['o2']);
    const mine = await getPoll(rest[0], poll.id);
    expect(mine.status).toBe(200);
    expect(mine.body.data).toMatchObject({ id: poll.id, counts: { o1: 0, o2: 2, o3: 0 }, myVote: ['o2'], anonymous: true });
    expect((await getPoll(owner, poll.id)).body.data.myVote).toEqual([]);
    expect(JSON.stringify(mine.body)).not.toContain(id(rest[1])); // the other voter's id appears nowhere
    expect(mine.body.data).not.toHaveProperty('votes');
    const [out] = await users(1);
    expect((await getPoll(out, poll.id)).status).toBe(404);
    expect((await getPoll(owner, oid().toString())).status).toBe(404);
    expect((await getPoll(owner, 'bad')).status).toBe(400);
    expect((await http().get(`/api/v1/polls/${poll.id}`)).status).toBe(401);
  });
  it('a member who left the group loses access', async () => {
    const { owner, rest, g } = await group();
    const { poll } = await mk(owner, g);
    await http().delete(`/api/v1/conversations/${g.id}/members/${id(rest[0])}`).set(bearer(rest[0].accessToken));
    expect((await getPoll(rest[0], poll.id)).status).toBe(404);
  });
});

describe('vote', () => {
  it('single choice: one option; changing replaces; empty array retracts', async () => {
    const { owner, rest, g } = await group();
    const { poll } = await mk(owner, g);
    expect((await svc.vote(id(rest[0]), poll.id, ['o1'])).counts).toEqual({ o1: 1, o2: 0, o3: 0 });
    const r = await svc.vote(id(rest[0]), poll.id, ['o3']);
    expect(r).toMatchObject({ pollId: poll.id, counts: { o1: 0, o2: 0, o3: 1 }, closedAt: null, myVote: ['o3'] });
    expect(r.memberIds).toHaveLength(3);
    await expect(svc.vote(id(rest[0]), poll.id, ['o1', 'o2'])).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((await svc.vote(id(rest[0]), poll.id, [])).counts).toEqual({ o1: 0, o2: 0, o3: 0 });
    expect((await svc.vote(id(rest[0]), poll.id, [])).counts).toEqual({ o1: 0, o2: 0, o3: 0 }); // retracting nothing is harmless
    expect((await Poll.findById(poll.id).lean()).votes).toHaveLength(0);
  });
  it('multiple choice: several options, duplicates collapse, unknown or non-string options rejected', async () => {
    const { owner, rest, g } = await group();
    const { poll } = await mk(owner, g, { multiple: true });
    expect((await svc.vote(id(owner), poll.id, ['o1', 'o3', 'o1'])).counts).toEqual({ o1: 1, o2: 0, o3: 1 });
    await expect(svc.vote(id(owner), poll.id, ['o9'])).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(svc.vote(id(owner), poll.id, [5])).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(svc.vote(id(owner), poll.id, 'o1')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((await svc.vote(id(rest[0]), poll.id, ['o3'])).counts.o3).toBe(2);
  });
  it('race: 30 simultaneous votes from 3 users (10 each, changing their minds) leave exactly 3 vote entries', async () => {
    const { owner, rest, g } = await group();
    const { poll } = await mk(owner, g);
    const everyone = [owner, ...rest];
    await Promise.all(Array.from({ length: 30 }, (_, i) => svc.vote(id(everyone[i % 3]), poll.id, [`o${(i % 3) + 1}`])));
    const raw = await Poll.findById(poll.id).lean();
    expect(raw.votes).toHaveLength(3);
    expect(new Set(raw.votes.map((v) => String(v.user))).size).toBe(3);
    expect((await getPoll(owner, poll.id)).body.data.counts).toEqual({ o1: 1, o2: 1, o3: 1 });
  });
  it('non-members get NOT_FOUND; unknown polls NOT_FOUND', async () => {
    const { owner, g } = await group();
    const { poll } = await mk(owner, g);
    const [out] = await users(1);
    await expect(svc.vote(id(out), poll.id, ['o1'])).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(svc.vote(id(owner), oid().toString(), ['o1'])).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('close', () => {
  it('creator only, idempotent, blocks later votes and reports closedAt; counts are kept', async () => {
    const { owner, rest, g } = await group();
    const { poll } = await mk(owner, g);
    await svc.vote(id(rest[0]), poll.id, ['o1']);
    await expect(svc.closePoll(id(rest[0]), poll.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const c = await svc.closePoll(id(owner), poll.id);
    expect(c).toMatchObject({ pollId: poll.id, counts: { o1: 1, o2: 0, o3: 0 } });
    expect(c.closedAt).toBeInstanceOf(Date);
    const again = await svc.closePoll(id(owner), poll.id);
    expect(again.closedAt.getTime()).toBe(c.closedAt.getTime());
    await expect(svc.vote(id(rest[1]), poll.id, ['o2'])).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(svc.vote(id(rest[0]), poll.id, [])).rejects.toMatchObject({ code: 'CONFLICT' }); // cannot retract after close
    expect((await getPoll(rest[1], poll.id)).body.data.closedAt).toBeTruthy();
  });
  it('closesAt in the past closes the poll automatically (no job needed) and is reported as closedAt', async () => {
    const { owner, rest, g } = await group();
    const { poll } = await mk(owner, g, { closesInMin: 5 });
    await Poll.updateOne({ _id: poll.id }, { closesAt: new Date(Date.now() - 1000) });
    await expect(svc.vote(id(rest[0]), poll.id, ['o1'])).rejects.toMatchObject({ code: 'CONFLICT' });
    const r = (await getPoll(rest[0], poll.id)).body.data;
    expect(r.closedAt).toBeTruthy();
    expect(r.closedAt).toBe(r.closesAt);
  });
  it('race: a vote and a close at the same time never leave a vote counted after the close was reported', async () => {
    const { owner, rest, g } = await group();
    const { poll } = await mk(owner, g);
    const [v, c] = await Promise.allSettled([svc.vote(id(rest[0]), poll.id, ['o1']), svc.closePoll(id(owner), poll.id)]);
    expect(c.status).toBe('fulfilled');
    const final = await Poll.findById(poll.id).lean();
    expect(final.closedAt).toBeTruthy();
    // Either the vote landed before the close (and is in the final counts the close reported or later) or it was refused.
    if (v.status === 'rejected') expect(v.reason.code).toBe('CONFLICT');
    expect(final.votes.length).toBe(v.status === 'fulfilled' ? 1 : 0);
  });
});
