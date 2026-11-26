import { WS_LIMITS } from '../constants/eventTypes.js';

/** userId -> Set<socket>. Socket metadata lives on `socket.meta` ({ userId, connectedAt, rooms:Set }). In memory (single instance, D8). */
export function createConnectionManager({ maxPerUser = WS_LIMITS.MAX_SOCKETS_PER_USER } = {}) {
  const byUser = new Map();
  const all = new Set();
  return {
    /** Adds the socket. Returns the sockets that must be closed (oldest first) to respect the per-user cap. */
    add(socket) {
      const { userId } = socket.meta;
      let set = byUser.get(userId);
      if (!set) { set = new Set(); byUser.set(userId, set); }
      set.add(socket);
      all.add(socket);
      const evict = [];
      for (const s of set) { // Set keeps insertion order: oldest first
        if (set.size - evict.length <= maxPerUser) break;
        if (s !== socket) evict.push(s);
      }
      return evict;
    },
    remove(socket) {
      const set = byUser.get(socket.meta.userId);
      if (set) { set.delete(socket); if (!set.size) byUser.delete(socket.meta.userId); }
      all.delete(socket);
    },
    socketsOf: (userId) => [...(byUser.get(String(userId)) || [])],
    hasUser: (userId) => byUser.has(String(userId)),
    all: () => [...all],
    size: () => all.size,
    userCount: () => byUser.size,
    closeUser(userId, code, reason) { for (const s of this.socketsOf(userId)) s.close(code, reason); },
  };
}
