import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { registerUser, befriend, bearer } from '../helpers/app.js';
import { startWsApp, connect } from './wsHelpers.js';

let ctx; let alice; let bob; let stranger; let a1; let a2; let b1; let s1;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const changes = (c, userId) => c.ofType('ACTIVITY_CHANGED').map((f) => f.payload).filter((p) => p.userId === userId);

beforeAll(async () => {
  ctx = await startWsApp();
  alice = await registerUser(ctx.http); bob = await registerUser(ctx.http); stranger = await registerUser(ctx.http);
  await befriend(ctx.http, alice, bob);
  a1 = await connect(ctx, alice); a2 = await connect(ctx, alice); b1 = await connect(ctx, bob); s1 = await connect(ctx, stranger);
});
afterAll(async () => { await ctx.stop(); });

describe('ACTIVITY_UPDATE / ACTIVITY_CLEAR', () => {
  it('ACKs the stored activity, tells friends and the owner\'s other tab, and nobody else', async () => {
    const pb = b1.nextOf('ACTIVITY_CHANGED'); const pa2 = a2.nextOf('ACTIVITY_CHANGED');
    const r = await a1.request('ACTIVITY_UPDATE', { type: 'studying', label: 'Calculus', expiresInMin: 30 });
    expect(r.type).toBe('ACK');
    expect(r.payload.data.activity).toMatchObject({ userId: alice.user.id, type: 'studying', label: 'Calculus', visibility: 'friends' });
    expect(r.payload.data.activity.expiresAt).toBeTruthy();
    for (const f of [await pb, await pa2]) expect(f.payload).toEqual({ userId: alice.user.id, activity: r.payload.data.activity });
    await pause(200);
    expect(changes(s1, alice.user.id)).toHaveLength(0); // a stranger never sees it
  });

  it('ignores a spoofed userId: the activity belongs to the socket user', async () => {
    const r = await a1.request('ACTIVITY_UPDATE', { type: 'coding', userId: bob.user.id });
    expect(r.payload.data.activity.userId).toBe(alice.user.id);
    const feed = await ctx.http().get('/api/v1/activity/feed').set(bearer(bob.accessToken));
    expect(feed.body.data.find((e) => e.user.id === alice.user.id).activity.type).toBe('coding');
    expect(feed.body.data.find((e) => e.user.id === bob.user.id)).toBeUndefined();
  });

  it('visibility "everyone" is still only broadcast to friends', async () => {
    const before = changes(s1, alice.user.id).length;
    const pb = b1.nextOf('ACTIVITY_CHANGED');
    await a1.request('ACTIVITY_UPDATE', { type: 'music', visibility: 'everyone' });
    expect((await pb).payload.activity.visibility).toBe('everyone');
    await pause(200);
    expect(changes(s1, alice.user.id).length).toBe(before);
  });

  it('visibility "nobody": friends are told it is gone (null), the owner keeps the real activity', async () => {
    const pb = b1.nextOf('ACTIVITY_CHANGED'); const pa2 = a2.nextOf('ACTIVITY_CHANGED');
    await a1.request('ACTIVITY_UPDATE', { type: 'gaming', visibility: 'nobody' });
    expect((await pb).payload).toEqual({ userId: alice.user.id, activity: null });
    expect((await pa2).payload.activity).toMatchObject({ type: 'gaming', visibility: 'nobody' });
  });

  it('ACTIVITY_CLEAR tells friends (null); clearing when nothing is set sends nothing more', async () => {
    const pw = b1.nextOf('ACTIVITY_CHANGED');
    await a1.request('ACTIVITY_UPDATE', { type: 'working' });
    expect((await pw).payload.activity.type).toBe('working'); // the fan-out is asynchronous: wait for it before the next step
    const pb = b1.nextOf('ACTIVITY_CHANGED');
    expect((await a1.request('ACTIVITY_CLEAR', {})).type).toBe('ACK');
    expect((await pb).payload).toEqual({ userId: alice.user.id, activity: null });
    await pause(150);
    const n = changes(b1, alice.user.id).length;
    expect((await a1.request('ACTIVITY_CLEAR', {})).type).toBe('ACK'); // idempotent
    await pause(250);
    expect(changes(b1, alice.user.id).length).toBe(n);
  });

  it('the HTTP path fans out the same way (the service emits for both)', async () => {
    await pause(300); // let any earlier fan-out settle
    const pb = b1.nextOf('ACTIVITY_CHANGED');
    const r = await ctx.http().put('/api/v1/activity/me').set(bearer(alice.accessToken)).send({ type: 'break' });
    expect(r.status).toBe(200);
    expect((await pb).payload.activity.type).toBe('break');
  });

  it('service validation comes back as ERROR frames', async () => {
    expect((await a1.request('ACTIVITY_UPDATE', { type: 'flying' })).payload.code).toBe('VALIDATION_ERROR');
    expect((await a1.request('ACTIVITY_UPDATE', { type: 'coding', label: 'x'.repeat(61) })).payload.code).toBe('VALIDATION_ERROR');
    expect((await a1.request('ACTIVITY_UPDATE', { type: 'coding', expiresInMin: 0 })).payload.code).toBe('VALIDATION_ERROR');
    expect((await a1.request('ACTIVITY_UPDATE', { type: 'coding', visibility: 'world' })).payload.code).toBe('VALIDATION_ERROR');
    expect((await a1.request('ACTIVITY_UPDATE', {})).payload.code).toBe('VALIDATION_ERROR');
  });

  it('a user who is no longer a friend stops receiving the activity', async () => {
    const carol = await registerUser(ctx.http); await befriend(ctx.http, alice, carol);
    const cc = await connect(ctx, carol);
    const p = cc.nextOf('ACTIVITY_CHANGED');
    await a1.request('ACTIVITY_UPDATE', { type: 'coding' });
    await p;
    await ctx.http().delete(`/api/v1/friends/${carol.user.id}`).set(bearer(alice.accessToken));
    const n = changes(cc, alice.user.id).length;
    await a1.request('ACTIVITY_UPDATE', { type: 'music' });
    await pause(250);
    expect(changes(cc, alice.user.id).length).toBe(n);
  });
});
