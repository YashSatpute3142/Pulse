import { vi } from 'vitest';

export const json = (status, body, headers = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

/** Queue of fetch responses, consumed in order. Records calls. */
export function stubFetch(...responses) {
  const queue = [...responses];
  const fn = vi.fn(async () => {
    const next = queue.shift();
    if (!next) throw new Error('fetch called more times than expected');
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next() : next;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

export const ME = { id: 'u1', username: 'aarav', displayName: 'Aarav Kapoor', avatarUrl: null, email: 'a@x.io', settings: { theme: 'system' } };

export class FakeWebSocket {
  static instances = [];
  constructor(url) { this.url = url; this.sent = []; this.closed = null; FakeWebSocket.instances.push(this); }
  send(data) { this.sent.push(JSON.parse(data)); }
  close(code = 1000) { this.closed = code; }
  // test drivers
  serverSend(type, payload = {}) { this.onmessage?.({ data: JSON.stringify({ v: 1, type, ts: Date.now(), payload }) }); }
  serverClose(code) { this.onclose?.({ code }); }
}

/** Route-based fetch stub: handlers keyed 'METHOD /path' (path relative to /api/v1). Unknown routes fail loudly. */
export function routeFetch(handlers) {
  const calls = [];
  const fn = vi.fn(async (url, init = {}) => {
    const path = new URL(url, 'http://localhost').pathname.replace(/^.*\/api\/v1/, '');
    const key = `${init.method || 'GET'} ${path}`;
    calls.push({ key, init, body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body });
    const h = handlers[key];
    if (!h) throw new Error(`Unhandled request ${key}`);
    const r = await (typeof h === 'function' ? h(init) : h);
    if (r instanceof Error) throw r;
    return r instanceof Response ? r : json(200, r);
  });
  vi.stubGlobal('fetch', fn);
  fn.calls = calls;
  return fn;
}

/** matchMedia stub driven by a viewport width. Narrow viewports behave like touch devices (coarse pointer, no hover). */
export function setViewport(width, { touch = width < 768 } = {}) {
  window.matchMedia = (query) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    let matches = false;
    if (min) matches = width >= Number(min[1]);
    else if (/pointer:\s*fine/.test(query)) matches = !touch;
    else if (/pointer:\s*coarse/.test(query)) matches = touch;
    else if (/hover:\s*none/.test(query)) matches = touch;
    else if (/hover:\s*hover/.test(query)) matches = !touch;
    return { matches, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } };
  };
}
