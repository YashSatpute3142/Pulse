import { S2C } from '../constants/eventTypes.js';
import * as presenceService from '../services/presence.service.js';
import { listFriends } from '../services/friend.service.js';

const GRACE_MS = 20_000;

/**
 * Live presence (protocol Section 8). In memory, single instance (D8).
 *  - A user is `online` if any socket is online, `away` if sockets exist but all are away, otherwise offline.
 *  - When the last socket closes the user stays as they were for `graceMs` (20 s); only then `offline` is broadcast and lastSeenAt saved.
 *  - showPresence=false is applied by presence.service.getPresence (the user is always offline to others), so nothing about them is broadcast.
 *  - Audience of a change: the user's friends + the online members of the conversations they are in (socket rooms), never themselves.
 * Presence changes are serialized per user so two quick transitions cannot be delivered out of order.
 */
export function createPresenceManager({ connections, rooms, broadcast, logger, graceMs = GRACE_MS }) {
  const published = new Map(); // userId -> 'online' | 'away' (raw, before showPresence)
  const visible = new Map();   // userId -> last status actually broadcast (absent = offline)
  const state = new Map();     // userId -> { grace: Timeout|null, convKeys: Set<string> }
  const chains = new Map();

  presenceService.setPresenceProvider((ids) => new Map(ids.filter((id) => published.has(id)).map((id) => [id, published.get(id)])));

  const convKeysOf = (userId) => {
    const keys = new Set(state.get(userId)?.convKeys || []);
    for (const s of connections.socketsOf(userId)) for (const k of s.meta.rooms) if (k.startsWith('conv:')) keys.add(k);
    return keys;
  };
  const coMemberIds = (userId, convKeys) => {
    const ids = new Set();
    for (const k of convKeys) for (const s of rooms.members(k)) if (s.meta.userId !== userId) ids.add(s.meta.userId);
    return ids;
  };
  const friendIds = async (userId) => {
    try { return (await listFriends(userId)).map((f) => String(f.user.id)); } catch (err) { logger.warn({ err }, 'presence: friends lookup failed'); return []; }
  };

  async function doRecompute(userId, { lastSeenAt } = {}) {
    const sockets = connections.socketsOf(userId);
    const st = state.get(userId);
    if (!sockets.length && st?.grace) return; // inside the grace window: others still see the previous status
    const raw = !sockets.length ? 'offline' : sockets.some((s) => s.meta.status === 'online') ? 'online' : 'away';
    if (raw === 'offline') published.delete(userId); else published.set(userId, raw);

    const vis = (await presenceService.getPresence([userId])).get(userId);
    const before = visible.get(userId) ?? 'offline';
    if (vis === 'offline') visible.delete(userId); else visible.set(userId, vis);

    if (vis !== before) {
      const audience = new Set(await friendIds(userId));
      for (const id of coMemberIds(userId, convKeysOf(userId))) audience.add(id);
      audience.delete(userId);
      const payload = { userId, status: vis };
      if (vis === 'offline' && lastSeenAt) payload.lastSeenAt = lastSeenAt;
      broadcast.toUsers(audience, S2C.PRESENCE_UPDATE, payload);
    }
    if (raw === 'offline') state.delete(userId);
  }

  function recompute(userId, opts) {
    const prev = chains.get(userId) || Promise.resolve();
    const p = prev.then(() => doRecompute(userId, opts)).catch((err) => logger.error({ err, userId }, 'presence recompute failed'));
    chains.set(userId, p);
    p.then(() => { if (chains.get(userId) === p) chains.delete(userId); });
    return p;
  }

  return {
    /** A socket finished connecting (its conv rooms are joined). Cancels a pending offline. */
    onConnect(socket) {
      const { userId } = socket.meta;
      socket.meta.status = 'online';
      const st = state.get(userId);
      if (st?.grace) { clearTimeout(st.grace); st.grace = null; }
      return recompute(userId);
    },
    /** `roomKeys` = the socket's rooms captured before they were released. */
    onDisconnect(socket, roomKeys = []) {
      const { userId } = socket.meta;
      const st = state.get(userId) || { grace: null, convKeys: new Set() };
      for (const k of roomKeys) if (k.startsWith('conv:')) st.convKeys.add(k);
      state.set(userId, st);
      if (connections.socketsOf(userId).length) { recompute(userId); return; } // other tabs remain: maybe online -> away
      if (st.grace) return;
      st.grace = setTimeout(async () => {
        st.grace = null;
        if (connections.socketsOf(userId).length) return; // came back (onConnect also clears this timer)
        const at = new Date();
        try { await presenceService.recordLastSeen(userId, at); } catch (err) { logger.error({ err, userId }, 'recordLastSeen failed'); }
        await recompute(userId, { lastSeenAt: at.toISOString() });
      }, graceMs);
      st.grace.unref?.();
    },
    setStatus(socket, status) {
      if (socket.meta.status === status) return;
      socket.meta.status = status;
      recompute(socket.meta.userId);
    },
    /** Any user event (not PING, not an explicit away) returns the socket to online. */
    markActive(socket) { if (socket.meta.status !== 'online') this.setStatus(socket, 'online'); },
    /** Presence of the people this socket's user may see: friends + online members of their conversations. Offline users are omitted. */
    async snapshot(socket) {
      const { userId } = socket.meta;
      const ids = new Set(await friendIds(userId));
      for (const id of coMemberIds(userId, convKeysOf(userId))) ids.add(id);
      ids.delete(userId);
      const out = {};
      for (const [id, status] of await presenceService.getPresence([...ids])) if (status !== 'offline') out[id] = { status };
      return out;
    },
    stats: () => ({ published: published.size, visible: visible.size, tracked: state.size }),
    shutdown() { for (const st of state.values()) if (st.grace) clearTimeout(st.grace); state.clear(); },
  };
}
