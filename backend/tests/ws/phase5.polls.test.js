import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { registerUser, befriend, makeDm, bearer } from '../helpers/app.js';
import { startWsApp, connect } from './wsHelpers.js';
import { Poll } from '../../src/models/Poll.js';

let ctx; let alice; let bob; let carol; let dm; let a1; let a2; let b1; let c1;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const create = (c, over = {}) => c.request('POLL_CREATE', { conversationId: dm.id, question: 'Pizza or pasta?', options: ['Pizza', 'Pasta', 'Salad'], ...over });

beforeAll(async () => {
  ctx = await startWsApp();
  alice = await registerUser(ctx.http); bob = await registerUser(ctx.http); carol = await registerUser(ctx.http);
  await befriend(ctx.http, alice, bob); dm = await makeDm(ctx.http, alice, bob);
  a1 = await connect(ctx, alice); a2 = await connect(ctx, alice); b1 = await connect(ctx, bob); c1 = await connect(ctx, carol);
});
afterAll(async () => { await ctx.stop(); });

describe('POLL_CREATE', () => {
  it('ACKs { poll, message }, pushes POLL_CREATED to the other member and the creator\'s other tab, not to the sending socket or strangers', async () => {
    const pb = b1.nextOf('POLL_CREATED'); const pa2 = a2.nextOf('POLL_CREATED');
    const r = await create(a1, { multiple: true });
    expect(r.type).toBe('ACK');
    const { poll, message } = r.payload.data;
    expect(poll).toMatchObject({ conversationId: dm.id, creatorId: alice.user.id, question: 'Pizza or pasta?', multiple: true, anonymous: false, closedAt: null, myVote: [] });
    expect(poll.options.map((o) => o.text)).toEqual(['Pizza', 'Pasta', 'Salad']);
    expect(message).toMatchObject({ conversationId: dm.id, senderId: alice.user.id, type: 'poll' });
    for (const f of [await pb, await pa2]) expect(f.payload.poll.id).toBe(poll.id);
    await pause(150);
    expect(a1.ofType('POLL_CREATED')).toHaveLength(0);
    expect(c1.ofType('POLL_CREATED')).toHaveLength(0);
    expect((await ctx.http().get(`/api/v1/polls/${poll.id}`).set(bearer(bob.accessToken))).status).toBe(200);
  });
  it('rejects bad polls with the service\'s validation error', async () => {
    expect((await create(a1, { options: ['only one'] })).payload.code).toBe('VALIDATION_ERROR');
    expect((await create(a1, { options: ['same', 'SAME'] })).payload.code).toBe('VALIDATION_ERROR');
    expect((await create(a1, { question: '   ' })).payload.code).toBe('VALIDATION_ERROR');
    expect((await create(a1, { closesInMin: 0 })).payload.code).toBe('VALIDATION_ERROR');
    expect((await create(a1, { options: 'nope' })).payload.code).toBe('VALIDATION_ERROR');
  });
  it('a non-member cannot create a poll in the conversation', async () => {
    const r = await create(c1);
    expect(r.type).toBe('ERROR'); expect(['NOT_FOUND', 'FORBIDDEN']).toContain(r.payload.code);
  });
});

describe('POLL_VOTE / POLL_CLOSE', () => {
  let poll;
  beforeAll(async () => { poll = (await create(a1, { multiple: true })).payload.data.poll; });

  it('ACKs counts + myVote; other members get counts only (never who voted)', async () => {
    const pa = a1.nextOf('POLL_UPDATED');
    const r = await b1.request('POLL_VOTE', { pollId: poll.id, optionIds: [poll.options[0].id, poll.options[2].id] });
    expect(r.payload.data).toEqual({ pollId: poll.id, counts: { o1: 1, o2: 0, o3: 1 }, myVote: ['o1', 'o3'], closedAt: null });
    const upd = await pa;
    expect(upd.payload).toEqual({ pollId: poll.id, counts: { o1: 1, o2: 0, o3: 1 }, closedAt: null });
    expect(JSON.stringify(upd.payload)).not.toContain(bob.user.id);
    await pause(150);
    expect(b1.ofType('POLL_UPDATED')).toHaveLength(0); // the voter's own socket only gets the ACK
    expect(c1.ofType('POLL_UPDATED')).toHaveLength(0);
  });
  it('a second vote replaces the first; [] retracts it', async () => {
    const r = await b1.request('POLL_VOTE', { pollId: poll.id, optionIds: ['o2'] });
    expect(r.payload.data.counts).toEqual({ o1: 0, o2: 1, o3: 0 });
    const r2 = await b1.request('POLL_VOTE', { pollId: poll.id, optionIds: [] });
    expect(r2.payload.data).toMatchObject({ myVote: [] });
    expect(r2.payload.data.counts).toEqual({ o1: 0, o2: 0, o3: 0 });
  });
  it('rejects unknown options and multiple options on a single-choice poll', async () => {
    const single = (await create(a1)).payload.data.poll;
    expect((await b1.request('POLL_VOTE', { pollId: single.id, optionIds: ['o1', 'o2'] })).payload.code).toBe('VALIDATION_ERROR');
    expect((await b1.request('POLL_VOTE', { pollId: poll.id, optionIds: ['o99'] })).payload.code).toBe('VALIDATION_ERROR');
  });
  it('a non-member cannot vote or close', async () => {
    for (const [t, p] of [['POLL_VOTE', { pollId: poll.id, optionIds: ['o1'] }], ['POLL_CLOSE', { pollId: poll.id }]]) {
      const r = await c1.request(t, p);
      expect(r.type, t).toBe('ERROR'); expect(['NOT_FOUND', 'FORBIDDEN'], t).toContain(r.payload.code);
    }
  });
  it('the same user voting from two devices at once leaves exactly one vote', async () => {
    const p = (await create(a1)).payload.data.poll;
    const b2 = await connect(ctx, bob);
    await Promise.all([b1.request('POLL_VOTE', { pollId: p.id, optionIds: ['o1'] }), b2.request('POLL_VOTE', { pollId: p.id, optionIds: ['o2'] })]);
    const doc = await Poll.findById(p.id).lean();
    expect(doc.votes).toHaveLength(1);
  });
  it('anonymous polls never expose voters over the socket', async () => {
    const p = (await create(a1, { anonymous: true })).payload.data.poll;
    const pa = a1.nextOf('POLL_UPDATED');
    const r = await b1.request('POLL_VOTE', { pollId: p.id, optionIds: ['o1'] });
    expect(r.payload.data.counts).toEqual({ o1: 1, o2: 0, o3: 0 });
    expect(JSON.stringify((await pa).payload)).not.toContain(bob.user.id);
  });
  it('only the creator can close; everyone (the closer too) is told; later votes are refused; closing again is harmless', async () => {
    expect((await b1.request('POLL_CLOSE', { pollId: poll.id })).payload.code).toBe('FORBIDDEN');
    const pb = b1.nextOf('POLL_UPDATED'); const pa = a1.nextOf('POLL_UPDATED');
    const r = await a1.request('POLL_CLOSE', { pollId: poll.id });
    expect(r.type).toBe('ACK');
    for (const f of [await pb, await pa]) expect(f.payload.pollId).toBe(poll.id);
    expect((await pb).payload.closedAt).toBeTruthy();
    expect((await b1.request('POLL_VOTE', { pollId: poll.id, optionIds: ['o1'] })).payload.code).toBe('CONFLICT');
    expect((await a1.request('POLL_CLOSE', { pollId: poll.id })).type).toBe('ACK');
  });
  it('a poll past its closing time refuses votes', async () => {
    const p = (await create(a1, { closesInMin: 5 })).payload.data.poll;
    await Poll.updateOne({ _id: p.id }, { $set: { closesAt: new Date(Date.now() - 1000) } });
    expect((await b1.request('POLL_VOTE', { pollId: p.id, optionIds: ['o1'] })).payload.code).toBe('CONFLICT');
  });
});
