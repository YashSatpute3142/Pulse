import { WS_CLOSE, WS_LIMITS } from '../constants/eventTypes.js';

/**
 * Protocol Section 11: a ping frame every `intervalMs`; a socket that has not answered (pong or any frame) by the next cycle
 * is closed with 4008 and force-terminated after `graceMs` if the closing handshake never completes (half-open TCP).
 */
export function startHeartbeat(connections, { intervalMs = WS_LIMITS.HEARTBEAT_MS, graceMs = WS_LIMITS.HEARTBEAT_HEARD_GRACE_MS } = {}) {
  const timer = setInterval(() => {
    for (const s of connections.all()) {
      if (s.readyState !== 1) continue;
      if (!s.meta.alive) {
        s.close(WS_CLOSE.HEARTBEAT, 'heartbeat timeout');
        setTimeout(() => s.terminate(), graceMs).unref();
        continue;
      }
      s.meta.alive = false;
      try { s.ping(); } catch { /* socket is going away */ }
    }
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
