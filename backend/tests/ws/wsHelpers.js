import http from 'node:http';
import request from 'supertest';
import WebSocket from 'ws';
import { connectDb, disconnectDb } from '../../src/config/db.js';
import { createApp } from '../../src/app.js';
import { createWsServer } from '../../src/ws/index.js';
import * as models from '../../src/models/index.js';
import { bearer } from '../helpers/app.js';

export const ORIGIN = 'http://localhost:5173';

/** Real Express app + real http.Server + real ws server + real MongoDB (own database per test file). */
export async function startWsApp(wsOptions = {}) {
  await connectDb();
  await Promise.all(Object.values(models).map((M) => M.syncIndexes()));
  const app = createApp();
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const wsServer = createWsServer(server, wsOptions);
  const port = server.address().port;
  const clients = new Set();
  return {
    app, server, wsServer, port,
    http: () => request(app),
    url: (q = '') => `ws://127.0.0.1:${port}/ws${q}`,
    track: (c) => { clients.add(c); return c; },
    async stop() {
      for (const c of clients) c.ws.terminate();
      await wsServer.close({ timeoutMs: 500 });
      await new Promise((r) => server.close(r));
      await disconnectDb();
    },
  };
}

export async function getTicket(ctx, user) {
  const r = await ctx.http().post('/api/v1/auth/ws-ticket').set(bearer(user.accessToken));
  if (r.status !== 200) throw new Error(`ticket failed ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.data.ticket;
}

/** Thin test client over the real `ws` package: records every frame; request() correlates ACK/ERROR by id. */
export function wrap(ws) {
  const frames = [];
  const waiters = [];
  let n = 0;
  let closed = null;
  const closeWaiters = [];
  ws.on('message', (raw) => {
    const f = JSON.parse(raw.toString());
    frames.push(f);
    for (const w of [...waiters]) if (w.pred(f)) { waiters.splice(waiters.indexOf(w), 1); clearTimeout(w.t); w.resolve(f); }
  });
  ws.on('close', (code, reason) => { closed = { code, reason: reason.toString() }; closeWaiters.splice(0).forEach((r) => r(closed)); });
  const c = {
    ws, frames,
    ofType: (t) => frames.filter((f) => f.type === t),
    waitFor(pred, ms = 3000) {
      const p = typeof pred === 'string' ? (f) => f.type === pred : pred;
      const hit = frames.find(p);
      if (hit) return Promise.resolve(hit);
      return new Promise((resolve, reject) => {
        const w = { pred: p, resolve, t: setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); reject(new Error(`timeout waiting for frame; got ${frames.map((f) => f.type).join(',')}`)); }, ms) };
        waiters.push(w);
      });
    },
    /** Wait for a NEW frame of this type (ignores frames already received). */
    nextOf(type, ms = 3000) {
      const seen = new Set(frames);
      return c.waitFor((f) => f.type === type && !seen.has(f), ms);
    },
    sendRaw: (s) => ws.send(s),
    frame(type, payload = {}, id = `id-${++n}-${Math.random().toString(36).slice(2, 8)}`) {
      ws.send(JSON.stringify({ v: 1, type, id, ts: Date.now(), payload }));
      return id;
    },
    /** Resolves with the ACK/ERROR frame for this request. */
    request(type, payload = {}, ms = 3000) {
      const id = c.frame(type, payload);
      return c.waitFor((f) => (f.type === 'ACK' || f.type === 'ERROR') && f.payload.replyTo === id, ms);
    },
    closed: () => (closed ? Promise.resolve(closed) : new Promise((r) => { closeWaiters.push(r); setTimeout(() => r(null), 5000).unref(); })),
    quiet: (ms = 250) => new Promise((r) => setTimeout(r, ms)),
  };
  return c;
}

/** Full happy path: ticket -> connect -> wait READY. */
export async function connect(ctx, user, { origin = ORIGIN, ticket } = {}) {
  const t = ticket ?? (await getTicket(ctx, user));
  const ws = new WebSocket(ctx.url(`?ticket=${encodeURIComponent(t)}`), { headers: origin ? { Origin: origin } : {} });
  const c = ctx.track(wrap(ws));
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); ws.once('unexpected-response', (_q, res) => reject(new Error(`upgrade refused ${res.statusCode}`))); });
  await c.waitFor('READY');
  return c;
}

/** Resolves with the HTTP status of a refused upgrade (or 101/'opened' if it unexpectedly succeeds). */
export function upgradeStatus(ctx, { path = '/ws', query = '', origin = ORIGIN } = {}) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${ctx.port}${path}${query}`, { headers: origin ? { Origin: origin } : {} });
    ws.once('unexpected-response', (_q, res) => { resolve(res.statusCode); ws.terminate(); });
    ws.once('open', () => { resolve('opened'); ws.terminate(); });
    ws.once('error', () => resolve('error'));
  });
}

/** Poll until fn() is truthy (registry cleanup happens on the server's own 'close' event, slightly after the client sees the close). */
export async function until(fn, ms = 2000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 20)); }
  return !!(await fn());
}

/** A second ws server on the same database, to simulate a restart / second process (own http.Server, same app). */
export async function startExtra(ctx, wsOptions = {}) {
  const server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const wsServer = createWsServer(server, wsOptions);
  const port = server.address().port;
  return {
    ...ctx, server, wsServer, port, url: (q = '') => `ws://127.0.0.1:${port}/ws${q}`,
    async stop() { await wsServer.close({ timeoutMs: 500 }); await new Promise((r) => server.close(r)); },
  };
}
