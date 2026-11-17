import { C2S, S2C, WS_CLOSE, WS_VERSION } from '../constants/eventTypes.js';
import { uuid } from '../utils/uuid.js';

const MAX_FRAME_BYTES = 16 * 1024;
const NO_ACK = new Set([C2S.PING, C2S.TYPING_START, C2S.TYPING_STOP, C2S.CANVAS_UPDATE]);
const BASE_DELAY = 1000;
const MAX_DELAY = 30000;
const PING_EVERY = 25000;
const STALE_AFTER = 45000;

export function backoffDelay(attempt, random = Math.random) {
  const ceiling = Math.min(MAX_DELAY, BASE_DELAY * 2 ** attempt);
  return Math.round(ceiling * (0.5 + random() * 0.5)); // exponential 1s -> 30s with jitter
}

export function parseServerTime(v) {
  if (typeof v === 'number') return v;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

/**
 * Native WebSocket client (WEBSOCKET_PROTOCOL.md). No Socket.IO.
 * Lifecycle: getTicket() -> open wss://...?ticket= -> wait READY -> REGISTER. Reconnect with backoff + jitter and a
 * fresh ticket every attempt. 4001/4002 are final (go to login). Sends fail fast while not open; offline queueing is Phase 3.
 *
 * deps: { getTicket, getUrl, bus, onStatus, onFinal, getRegisterPayload, WebSocketImpl? }
 */
export function createSocketClient({ getTicket, getUrl, bus, onStatus, onFinal, onReady, getRegisterPayload, WebSocketImpl }) {
  const WS = WebSocketImpl || globalThis.WebSocket;
  let ws = null;
  let status = 'idle';
  let stopped = false;
  let attempt = 0;
  let everOpen = false;
  let retryTimer = null;
  let pingTimer = null;
  let lastFrameAt = 0;
  let serverOffset = 0;
  const pending = new Map();

  const setStatus = (s) => { if (s !== status) { status = s; onStatus?.(s); } };

  function failPending(reason) {
    pending.forEach((p) => { clearTimeout(p.timer); p.reject(new Error(reason)); });
    pending.clear();
  }
  function stopHeartbeat() { clearInterval(pingTimer); pingTimer = null; }
  function startHeartbeat() {
    stopHeartbeat();
    lastFrameAt = Date.now();
    pingTimer = setInterval(() => {
      if (Date.now() - lastFrameAt > STALE_AFTER) { ws?.close(); return; } // half-open connection
      sendRaw(C2S.PING, {});
    }, PING_EVERY);
  }

  function sendRaw(type, payload, id = uuid()) {
    const frame = JSON.stringify({ v: WS_VERSION, type, id, ts: Date.now(), payload });
    if (new TextEncoder().encode(frame).length > MAX_FRAME_BYTES) throw new Error('Message too large');
    ws.send(frame);
    return id;
  }

  function scheduleReconnect(delay) {
    if (stopped) return;
    setStatus('reconnecting');
    clearTimeout(retryTimer);
    retryTimer = setTimeout(open, delay ?? backoffDelay(attempt++));
  }

  async function open() {
    if (stopped) return;
    setStatus(everOpen || attempt > 0 ? 'reconnecting' : 'connecting');
    let ticket;
    try {
      ({ ticket } = await getTicket());
    } catch (err) {
      if (stopped) return;
      // A 401 here means the session ended; refreshSession() already told the AuthProvider. Do not loop.
      if (err?.status === 401) { stopped = true; setStatus('closed'); return; }
      scheduleReconnect();
      return;
    }
    if (stopped) return;
    const base = getUrl();
    const url = `${base}${base.includes('?') ? '&' : '?'}ticket=${encodeURIComponent(ticket)}`;
    let sock;
    try { sock = new WS(url); } catch { scheduleReconnect(); return; }
    ws = sock;

    sock.onmessage = (ev) => {
      lastFrameAt = Date.now();
      let env;
      try { env = JSON.parse(ev.data); } catch { return; }
      if (!env || env.v !== WS_VERSION || typeof env.type !== 'string') return;
      const payload = env.payload ?? {};

      if (env.type === S2C.READY) {
        const serverNow = parseServerTime(payload.serverNow);
        if (serverNow != null) serverOffset = serverNow - Date.now();
        const reconnect = everOpen;
        everOpen = true;
        attempt = 0;
        setStatus('open');
        startHeartbeat();
        try { sendRaw(C2S.REGISTER, getRegisterPayload?.() || {}); } catch { /* ignore */ }
        onReady?.({ reconnect, userId: payload.userId });
        return;
      }
      if (env.type === S2C.ACK || env.type === S2C.ERROR) {
        const p = pending.get(payload.replyTo);
        if (p) {
          pending.delete(payload.replyTo);
          clearTimeout(p.timer);
          if (env.type === S2C.ACK && payload.ok !== false) p.resolve(payload.data);
          else p.reject(Object.assign(new Error(payload.message || payload.error?.message || 'Request failed'), { code: payload.code || payload.error?.code }));
        } else if (env.type === S2C.ERROR) {
          bus.emit(S2C.ERROR, payload, env);
        }
        return;
      }
      bus.emit(env.type, payload, env);
    };

    sock.onclose = (ev) => {
      if (ws !== sock) return;
      stopHeartbeat();
      failPending('Connection closed');
      ws = null;
      if (stopped) { setStatus('closed'); return; }
      if (ev.code === WS_CLOSE.UNAUTHENTICATED || ev.code === WS_CLOSE.SESSION_REVOKED) {
        stopped = true;
        setStatus('closed');
        onFinal?.(ev.code);
        return;
      }
      // 4003 (evicted by a newer tab) and 1008 (rate abuse): reconnecting fast would fight other tabs, so wait the maximum.
      if (ev.code === WS_CLOSE.TOO_MANY || ev.code === WS_CLOSE.POLICY) { attempt = 10; }
      scheduleReconnect();
    };
    sock.onerror = () => { /* onclose follows; nothing useful in the event */ };
  }

  const onOnline = () => {
    if (stopped || status === 'open') return;
    attempt = 0;
    clearTimeout(retryTimer);
    open();
  };

  return {
    connect() {
      stopped = false;
      window.addEventListener('online', onOnline);
      open();
    },
    close(code = WS_CLOSE.NORMAL) {
      stopped = true;
      window.removeEventListener('online', onOnline);
      clearTimeout(retryTimer);
      stopHeartbeat();
      failPending('Connection closed');
      const s = ws; ws = null;
      try { s?.close(code); } catch { /* ignore */ }
      setStatus('closed');
    },
    /** Resolves with ACK data. Rejects when not open, on ERROR, on timeout, or if the socket closes first. */
    send(type, payload = {}, { timeoutMs = 10000 } = {}) {
      if (status !== 'open' || !ws) return Promise.reject(Object.assign(new Error('Not connected'), { code: 'NOT_CONNECTED' }));
      let id;
      try { id = sendRaw(type, payload); } catch (e) { return Promise.reject(e); }
      if (NO_ACK.has(type)) return Promise.resolve(undefined);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(Object.assign(new Error('Timed out'), { code: 'TIMEOUT' })); }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
      });
    },
    getStatus: () => status,
    /** serverNow - Date.now() measured at READY. Use: serverTime = Date.now() + offset. */
    getServerOffset: () => serverOffset,
  };
}
