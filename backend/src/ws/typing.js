import { S2C } from '../constants/eventTypes.js';
import { roomKey } from './roomManager.js';

const EXPIRE_MS = 5000;
const MIN_GAP_MS = 2000;

/**
 * Typing indicators (protocol Section 8): ephemeral, never persisted, keyed userId + conversationId.
 *  - Only a socket that is in conv:<id> (membership decided by the services) may type there; anything else is dropped silently (no-reply event).
 *  - Every accepted TYPING_START is relayed (the client resends every 3 s and expires entries after 6 s) and re-arms a 5 s auto-stop.
 *  - At most one relay per 2 s per socket and conversation (protocol Section 4); extra STARTs inside the gap only re-arm the timer.
 *  - Only OTHER users get TYPING_UPDATE, never the typist's own tabs.
 */
export function createTypingManager({ connections, rooms, broadcast, expireMs = EXPIRE_MS, minGapMs = MIN_GAP_MS }) {
  const timers = new Map(); // userId -> Map<conversationId, Timeout>

  const relay = (userId, conversationId, typing) => {
    const text = { conversationId, userId, typing };
    for (const s of rooms.members(roomKey.conv(conversationId))) if (s.meta.userId !== userId) broadcast.toSocket(s, S2C.TYPING_UPDATE, text);
  };
  const clear = (userId, conversationId) => {
    const m = timers.get(userId);
    const t = m?.get(conversationId);
    if (!t) return false;
    clearTimeout(t); m.delete(conversationId);
    if (!m.size) timers.delete(userId);
    return true;
  };

  return {
    start(socket, conversationId) {
      const { userId } = socket.meta;
      if (!rooms.has(roomKey.conv(conversationId), socket)) return;
      const now = Date.now();
      const last = socket.meta.typingSentAt ?? (socket.meta.typingSentAt = new Map());
      const t = setTimeout(() => { if (clear(userId, conversationId)) relay(userId, conversationId, false); }, expireMs);
      t.unref?.();
      clear(userId, conversationId);
      let m = timers.get(userId);
      if (!m) { m = new Map(); timers.set(userId, m); }
      m.set(conversationId, t);
      if (now - (last.get(conversationId) ?? 0) < minGapMs) return; // inside the 2 s gap: re-armed only
      last.set(conversationId, now);
      relay(userId, conversationId, true);
    },
    stop(socket, conversationId) {
      const { userId } = socket.meta;
      if (!rooms.has(roomKey.conv(conversationId), socket)) return;
      if (clear(userId, conversationId)) relay(userId, conversationId, false);
      socket.meta.typingSentAt?.delete(conversationId);
    },
    /** The user has no socket left: everything they were typing stops now. */
    onUserGone(userId) {
      for (const conversationId of [...(timers.get(userId)?.keys() || [])]) { clear(userId, conversationId); relay(userId, conversationId, false); }
    },
    userHasSockets: (userId) => connections.socketsOf(userId).length > 0,
    count: () => [...timers.values()].reduce((n, m) => n + m.size, 0),
    shutdown() { for (const m of timers.values()) for (const t of m.values()) clearTimeout(t); timers.clear(); },
  };
}
