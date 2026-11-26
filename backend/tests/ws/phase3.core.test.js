import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { registerUser, cookieValue } from '../helpers/app.js';
import { startWsApp, getTicket, connect, upgradeStatus, until, ORIGIN } from './wsHelpers.js';

let ctx;
let alice;
beforeAll(async () => { ctx = await startWsApp({ heartbeatMs: 150, heartbeatGraceMs: 100, maxSocketsPerUser: 5 }); alice = await registerUser(ctx.http); });
afterAll(async () => { await ctx.stop(); });

describe('upgrade authentication (protocol 1)', () => {
  it('rejects a missing ticket with 401', async () => { expect(await upgradeStatus(ctx)).toBe(401); });
  it('rejects a bogus ticket with 401', async () => { expect(await upgradeStatus(ctx, { query: '?ticket=nope' })).toBe(401); });
  it('rejects a disallowed Origin with 403 even with a valid ticket', async () => {
    const t = await getTicket(ctx, alice);
    expect(await upgradeStatus(ctx, { query: `?ticket=${t}`, origin: 'https://evil.example' })).toBe(403);
  });
  it('rejects another path with 404', async () => {
    const t = await getTicket(ctx, alice);
    expect(await upgradeStatus(ctx, { path: '/socket', query: `?ticket=${t}` })).toBe(404);
  });
  it('a ticket works exactly once', async () => {
    const t = await getTicket(ctx, alice);
    const c = await connect(ctx, alice, { ticket: t });
    expect(c.ofType('READY')).toHaveLength(1);
    expect(await upgradeStatus(ctx, { query: `?ticket=${t}` })).toBe(401);
    c.ws.close();
  });
  it('accepts a valid ticket and sends READY with the socket-bound identity', async () => {
    const c = await connect(ctx, alice);
    const ready = c.ofType('READY')[0];
    expect(ready.v).toBe(1);
    expect(ready.payload.userId).toBe(alice.user.id);
    expect(Math.abs(ready.payload.serverNow - Date.now())).toBeLessThan(5000);
    expect(ready.payload.heartbeatSec).toBeGreaterThanOrEqual(0);
    c.ws.close();
  });
});

describe('envelope and pipeline (protocol 2, 3)', () => {
  let c;
  beforeAll(async () => { c = await connect(ctx, alice); });
  afterAll(() => c.ws.close());

  it('answers PING with PONG', async () => { c.frame('PING'); expect((await c.nextOf('PONG')).type).toBe('PONG'); });
  it('invalid JSON -> ERROR INVALID_JSON', async () => { const p = c.nextOf('ERROR'); c.sendRaw('{nope'); const f = await p; expect(f.payload).toMatchObject({ code: 'INVALID_JSON', replyTo: null }); });
  it('wrong version -> INVALID_ENVELOPE with replyTo', async () => {
    const p = c.nextOf('ERROR'); c.sendRaw(JSON.stringify({ v: 2, type: 'PING', id: 'abc', payload: {} }));
    expect((await p).payload).toMatchObject({ code: 'INVALID_ENVELOPE', replyTo: 'abc' });
  });
  it('missing id -> INVALID_ENVELOPE', async () => {
    const p = c.nextOf('ERROR'); c.sendRaw(JSON.stringify({ v: 1, type: 'PING', payload: {} }));
    expect((await p).payload.code).toBe('INVALID_ENVELOPE');
  });
  it('non-object payload -> INVALID_ENVELOPE', async () => {
    const p = c.nextOf('ERROR'); c.sendRaw(JSON.stringify({ v: 1, type: 'REGISTER', id: 'x1', payload: [] }));
    expect((await p).payload).toMatchObject({ code: 'INVALID_ENVELOPE', replyTo: 'x1' });
  });
  it('unknown type -> UNKNOWN_TYPE', async () => { expect((await c.request('NOPE')).payload.code).toBe('UNKNOWN_TYPE'); });
  it('canvas events are not registered yet (deferred to Phase 6) -> UNKNOWN_TYPE', async () => {
    expect((await c.request('CANVAS_JOIN', { ownerType: 'room', ownerId: 'a'.repeat(24) })).payload.code).toBe('UNKNOWN_TYPE');
  });
  it('TYPING_START is not implemented until Phase 4 and, like every no-reply event, is dropped without an ERROR', async () => {
    const before = c.ofType('ERROR').length;
    c.frame('TYPING_START', { conversationId: 'a'.repeat(24) });
    await c.quiet(200);
    expect(c.ofType('ERROR').length).toBe(before);
  });
  it('schema failure -> VALIDATION_ERROR and nothing is processed', async () => {
    const r = await c.request('CHAT_MESSAGE', { conversationId: 'not-an-id', clientId: 'short' });
    expect(r.type).toBe('ERROR'); expect(r.payload.code).toBe('VALIDATION_ERROR');
  });
  it('binary frames are refused with INVALID_JSON', async () => { const p = c.nextOf('ERROR'); c.ws.send(Buffer.from([1, 2, 3])); expect((await p).payload.code).toBe('INVALID_JSON'); });
  it('REGISTER acks with a presence object (empty until Phase 4)', async () => {
    const r = await c.request('REGISTER', {});
    expect(r).toMatchObject({ type: 'ACK', payload: { ok: true, data: { presence: {} } } });
  });
});

describe('frame size (protocol 12)', () => {
  it('a frame over 16 KB closes the socket with 1009', async () => {
    const c = await connect(ctx, alice);
    c.sendRaw(JSON.stringify({ v: 1, type: 'PING', id: 'big', payload: { pad: 'x'.repeat(17 * 1024) } }));
    expect((await c.closed()).code).toBe(1009);
  });
});

describe('rate limiting (protocol 4)', () => {
  it('rejects chat bursts with RATE_LIMITED, then closes 1008 after 3 violations in 60 s', async () => {
    const u = await registerUser(ctx.http);
    const c = await connect(ctx, u);
    const ids = Array.from({ length: 16 }, () => c.frame('CHAT_MESSAGE', { conversationId: 'a'.repeat(24), clientId: 'client-id-12345', text: 'hi' }));
    const closed = await c.closed();
    expect(closed.code).toBe(1008);
    const limited = c.frames.filter((f) => f.type === 'ERROR' && f.payload.code === 'RATE_LIMITED');
    expect(limited.length).toBeGreaterThanOrEqual(2);
    // The first 10 got through the limiter and were answered by the pipeline (NOT_FOUND: no such conversation)
    const answered = c.frames.filter((f) => f.type === 'ERROR' && ids.includes(f.payload.replyTo) && f.payload.code !== 'RATE_LIMITED');
    expect(answered.length).toBe(10);
  });
  it('the default group allows 30 events / 10 s', async () => {
    const u = await registerUser(ctx.http);
    const c = await connect(ctx, u);
    for (let i = 0; i < 30; i += 1) c.frame('PING');
    await c.quiet(300);
    expect(c.ofType('PONG')).toHaveLength(30);
    c.ws.close();
  });
});

describe('heartbeat (protocol 11)', () => {
  it('a responsive client stays connected across several heartbeat cycles', async () => {
    const u = await registerUser(ctx.http);
    const c = await connect(ctx, u);
    await c.quiet(600); // 4 cycles at 150 ms; the ws client answers pings automatically
    expect(c.ws.readyState).toBe(WebSocket.OPEN);
    c.ws.close();
  });
  it('a client that never answers pings is closed with 4008', async () => {
    const u = await registerUser(ctx.http);
    const c = await connect(ctx, u);
    c.ws.pong = () => {}; // simulate a dead peer: the automatic pong reply is suppressed
    const closed = await c.closed();
    expect(closed.code).toBe(4008);
  });
});

describe('connection limits and cleanup', () => {
  it('the 6th socket of a user evicts the oldest with 4003', async () => {
    const u = await registerUser(ctx.http);
    const cs = [];
    for (let i = 0; i < 5; i += 1) cs.push(await connect(ctx, u));
    const sixth = await connect(ctx, u);
    expect((await cs[0].closed()).code).toBe(4003);
    expect(await until(() => ctx.wsServer.connections.socketsOf(u.user.id).length === 5)).toBe(true);
    for (const c of [...cs, sixth]) c.ws.close();
  });
  it('closing sockets releases every registry entry', async () => {
    const u = await registerUser(ctx.http);
    const a = await connect(ctx, u); const b = await connect(ctx, u);
    expect(ctx.wsServer.connections.socketsOf(u.user.id)).toHaveLength(2);
    expect(ctx.wsServer.rooms.size(`user:${u.user.id}`)).toBe(2);
    a.ws.close(); b.ws.terminate();
    await a.closed(); await b.closed();
    expect(await until(() => ctx.wsServer.connections.socketsOf(u.user.id).length === 0)).toBe(true);
    expect(ctx.wsServer.connections.hasUser(u.user.id)).toBe(false);
    expect(ctx.wsServer.rooms.size(`user:${u.user.id}`)).toBe(0);
  });
});

describe('session revocation (protocol 1, ARCHITECTURE 3)', () => {
  it('logout over HTTP sends SESSION_REVOKED to every tab and closes them with 4002', async () => {
    const u = await registerUser(ctx.http);
    const a = await connect(ctx, u); const b = await connect(ctx, u);
    const res = await ctx.http().post('/api/v1/auth/logout').set('Origin', ORIGIN).set('Cookie', `pulse_rt=${cookieValue(u.cookies)}`);
    expect([200, 204]).toContain(res.status);
    expect((await a.closed()).code).toBe(4002);
    expect((await b.closed()).code).toBe(4002);
    expect(a.ofType('SESSION_REVOKED')).toHaveLength(1);
  });
});

describe('graceful shutdown', () => {
  it('close() sends 1001 to every socket, refuses new upgrades and empties the registries', async () => {
    const own = await startWsApp({ heartbeatMs: 5000 });
    const u = await registerUser(own.http);
    const a = await connect(own, u); const b = await connect(own, u);
    const t = await getTicket(own, u);
    const ac = a.closed(); const bc = b.closed();
    await own.wsServer.close({ timeoutMs: 1000 });
    expect((await ac).code).toBe(1001); expect((await bc).code).toBe(1001);
    expect(own.wsServer.stats()).toMatchObject({ sockets: 0 });
    expect(await upgradeStatus(own, { query: `?ticket=${t}` })).not.toBe('opened');
    await new Promise((r) => own.server.close(r));
  });
});
