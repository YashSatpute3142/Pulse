import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FakeWebSocket } from '../test/helpers.js';
import { backoffDelay, createSocketClient, parseServerTime } from './socketClient.js';
import { createEventBus } from './eventBus.js';

let tickets; let bus; let statuses; let finals; let readies;
function make(extra = {}) {
  return createSocketClient({
    getTicket: vi.fn(async () => ({ ticket: `t${++tickets}` })),
    getUrl: () => 'ws://x/ws',
    bus, WebSocketImpl: FakeWebSocket,
    onStatus: (s) => statuses.push(s),
    onFinal: (c) => finals.push(c),
    onReady: (r) => readies.push(r),
    getRegisterPayload: () => ({ activeConversationId: 'c1' }),
    ...extra,
  });
}
const flush = async () => { await vi.advanceTimersByTimeAsync(0); };

beforeEach(() => { vi.useFakeTimers(); FakeWebSocket.instances = []; tickets = 0; bus = createEventBus(); statuses = []; finals = []; readies = []; });
afterEach(() => vi.useRealTimers());

describe('backoffDelay', () => {
  it('grows exponentially from 1s to a 30s cap, with jitter between 50% and 100%', () => {
    expect(backoffDelay(0, () => 1)).toBe(1000);
    expect(backoffDelay(0, () => 0)).toBe(500);
    expect(backoffDelay(3, () => 1)).toBe(8000);
    expect(backoffDelay(10, () => 1)).toBe(30000);
    expect(backoffDelay(10, () => 0)).toBe(15000);
  });
});

describe('parseServerTime', () => {
  it('accepts epoch ms and ISO strings, rejects junk', () => {
    expect(parseServerTime(1731700000000)).toBe(1731700000000);
    expect(parseServerTime('2024-11-15T20:26:40.000Z')).toBe(Date.parse('2024-11-15T20:26:40.000Z'));
    expect(parseServerTime('nope')).toBeNull();
  });
});

describe('socket client', () => {
  it('fetches a ticket, connects with ?ticket=, becomes open on READY and sends REGISTER', async () => {
    const c = make(); c.connect(); await flush();
    const ws = FakeWebSocket.instances[0];
    expect(ws.url).toBe('ws://x/ws?ticket=t1');
    expect(statuses).toEqual(['connecting']);
    ws.serverSend('READY', { userId: 'u1', serverNow: Date.now() + 5000, heartbeatSec: 30 });
    expect(c.getStatus()).toBe('open');
    expect(ws.sent[0]).toMatchObject({ v: 1, type: 'REGISTER', payload: { activeConversationId: 'c1' } });
    expect(readies).toEqual([{ reconnect: false, userId: 'u1' }]);
    expect(Math.abs(c.getServerOffset() - 5000)).toBeLessThan(50);
  });

  it('reconnects with a FRESH ticket after an abnormal close and flags the READY as a reconnect', async () => {
    const c = make(); c.connect(); await flush();
    FakeWebSocket.instances[0].serverSend('READY', { userId: 'u1', serverNow: Date.now() });
    FakeWebSocket.instances[0].serverClose(1006);
    expect(c.getStatus()).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(1100);
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(FakeWebSocket.instances[1].url).toContain('ticket=t2');
    FakeWebSocket.instances[1].serverSend('READY', { userId: 'u1', serverNow: Date.now() });
    expect(readies[1].reconnect).toBe(true);
  });

  it.each([4001, 4002])('does not reconnect on %i and reports it as final', async (code) => {
    const c = make(); c.connect(); await flush();
    FakeWebSocket.instances[0].serverSend('READY', { userId: 'u1', serverNow: Date.now() });
    FakeWebSocket.instances[0].serverClose(code);
    await vi.advanceTimersByTimeAsync(60000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(finals).toEqual([code]);
    expect(c.getStatus()).toBe('closed');
  });

  it('send() matches ACK by replyTo and resolves with data', async () => {
    const c = make(); c.connect(); await flush();
    const ws = FakeWebSocket.instances[0];
    ws.serverSend('READY', { userId: 'u1', serverNow: Date.now() });
    const p = c.send('CHAT_MESSAGE', { conversationId: 'c1', clientId: 'k', text: 'hi' });
    const frame = ws.sent.at(-1);
    expect(frame.id).toMatch(/[0-9a-f-]{36}/);
    ws.serverSend('ACK', { replyTo: frame.id, ok: true, data: { message: { id: 'm1' } } });
    await expect(p).resolves.toEqual({ message: { id: 'm1' } });
  });

  it('send() rejects on ERROR with the server code, on timeout, and when the socket closes first', async () => {
    const c = make(); c.connect(); await flush();
    const ws = FakeWebSocket.instances[0];
    ws.serverSend('READY', { userId: 'u1', serverNow: Date.now() });
    const bad = c.send('MESSAGE_DELETE', { messageId: 'm' });
    ws.serverSend('ERROR', { replyTo: ws.sent.at(-1).id, code: 'FORBIDDEN', message: 'no' });
    await expect(bad).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const slow = c.send('MESSAGE_DELETE', { messageId: 'm' }, { timeoutMs: 1000 });
    const slowAssert = expect(slow).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(1001); await slowAssert;

    const cut = c.send('MESSAGE_DELETE', { messageId: 'm' });
    const cutAssert = expect(cut).rejects.toThrow('Connection closed');
    ws.serverClose(1006); await cutAssert;
  });

  it('send() fails fast while not open and for oversized frames; no-ack types resolve immediately', async () => {
    const c = make();
    await expect(c.send('PING')).rejects.toMatchObject({ code: 'NOT_CONNECTED' });
    c.connect(); await flush();
    const ws = FakeWebSocket.instances[0];
    ws.serverSend('READY', { userId: 'u1', serverNow: Date.now() });
    await expect(c.send('CHAT_MESSAGE', { text: 'x'.repeat(20000) })).rejects.toThrow('too large');
    await expect(c.send('TYPING_START', { conversationId: 'c1' })).resolves.toBeUndefined();
  });

  it('routes server events to the bus and ignores malformed frames and wrong versions', async () => {
    const seen = []; bus.subscribe('MESSAGE_NEW', (p) => seen.push(p));
    const c = make(); c.connect(); await flush();
    const ws = FakeWebSocket.instances[0];
    ws.serverSend('READY', { userId: 'u1', serverNow: Date.now() });
    ws.serverSend('MESSAGE_NEW', { message: { id: 'm1' } });
    ws.onmessage({ data: 'not json' });
    ws.onmessage({ data: JSON.stringify({ v: 2, type: 'MESSAGE_NEW', payload: {} }) });
    expect(seen).toEqual([{ message: { id: 'm1' } }]);
  });

  it('retries when the ticket request fails with a network error, but stops on 401', async () => {
    let n = 0;
    const c = make({ getTicket: vi.fn(async () => { n++; if (n === 1) throw Object.assign(new Error('net'), { status: 0 }); return { ticket: 'ok' }; }) });
    c.connect(); await flush();
    expect(FakeWebSocket.instances).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1100);
    expect(FakeWebSocket.instances).toHaveLength(1);

    const d = make({ getTicket: vi.fn(async () => { throw Object.assign(new Error('x'), { status: 401 }); }) });
    d.connect(); await vi.advanceTimersByTimeAsync(60000);
    expect(d.getStatus()).toBe('closed');
  });

  it('close() during the ticket fetch never opens a socket (StrictMode double mount)', async () => {
    const c = make(); c.connect(); c.close(); await flush();
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(c.getStatus()).toBe('closed');
  });

  it('forces a reconnect when no frame arrives for 45s (half-open connection)', async () => {
    const c = make(); c.connect(); await flush();
    const ws = FakeWebSocket.instances[0];
    ws.serverSend('READY', { userId: 'u1', serverNow: Date.now() });
    await vi.advanceTimersByTimeAsync(50000);
    expect(ws.sent.some((f) => f.type === 'PING')).toBe(true);
    expect(ws.closed).not.toBeNull();
  });
});
