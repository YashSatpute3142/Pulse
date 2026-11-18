import { C2S } from '../../constants/eventTypes.js';

/**
 * In-memory send queue (owner decision default: queue and retry on reconnect, "failed" after 30 s).
 * CHAT_MESSAGE is idempotent on (conversationId, clientId), so re-sending after an unknown outcome is safe.
 *
 *  - Socket not open / closed mid-flight -> stays queued until flush() (called when the socket opens) or the 30 s limit.
 *  - Server ERROR (e.g. FORBIDDEN) or ACK timeout -> failed immediately; the user can retry().
 */
export function createOutbox({ send, onAck, onStatus, ttlMs = 30000, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const queued = new Map();
  const failed = new Map();

  function settleFailed(item, err) {
    clearTimer(item.timer);
    queued.delete(item.clientId);
    failed.set(item.clientId, item);
    onStatus(item.conversationId, item.clientId, 'failed', err?.message || 'Not delivered');
  }

  async function attempt(item) {
    if (item.inflight || !queued.has(item.clientId)) return;
    item.inflight = true;
    try {
      const data = await send(C2S.CHAT_MESSAGE, item.payload);
      clearTimer(item.timer);
      queued.delete(item.clientId);
      if (data?.message) onAck(item.conversationId, data.message);
    } catch (err) {
      item.inflight = false;
      if (err?.code === 'NOT_CONNECTED' || err?.message === 'Connection closed') return; // wait for flush or the time limit
      settleFailed(item, err);
    }
  }

  function enqueue({ conversationId, clientId, payload }) {
    const item = { conversationId, clientId, payload: { ...payload, conversationId, clientId }, inflight: false, timer: null };
    queued.set(clientId, item);
    onStatus(conversationId, clientId, 'sending', null);
    item.timer = setTimer(() => { if (queued.has(clientId)) settleFailed(item, new Error('Not delivered')); }, ttlMs);
    attempt(item);
  }

  return {
    enqueue,
    flush() { [...queued.values()].forEach(attempt); },
    retry(clientId) {
      const item = failed.get(clientId);
      if (!item) return;
      failed.delete(clientId);
      item.inflight = false;
      queued.set(clientId, item);
      onStatus(item.conversationId, clientId, 'sending', null);
      item.timer = setTimer(() => { if (queued.has(clientId)) settleFailed(item, new Error('Not delivered')); }, ttlMs);
      attempt(item);
    },
    discard(clientId) { failed.delete(clientId); const q = queued.get(clientId); if (q) clearTimer(q.timer); queued.delete(clientId); },
    size: () => queued.size,
    hasFailed: (clientId) => failed.has(clientId),
  };
}
