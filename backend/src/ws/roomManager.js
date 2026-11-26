/** Server-side membership (protocol Section 7). Keys: user:<id>, conv:<id>, focus:<id>, canvas:<type>:<id>. Joins are decided by services, never by the client. */
export function createRoomManager() {
  const rooms = new Map(); // key -> Set<socket>
  return {
    join(key, socket) {
      let set = rooms.get(key);
      if (!set) { set = new Set(); rooms.set(key, set); }
      set.add(socket);
      socket.meta.rooms.add(key);
    },
    leave(key, socket) {
      const set = rooms.get(key);
      if (set) { set.delete(socket); if (!set.size) rooms.delete(key); }
      socket.meta.rooms.delete(key);
    },
    leaveAll(socket) { for (const key of [...socket.meta.rooms]) this.leave(key, socket); },
    members: (key) => [...(rooms.get(key) || [])],
    has: (key, socket) => !!rooms.get(key)?.has(socket),
    size: (key) => rooms.get(key)?.size || 0,
    count: () => rooms.size,
  };
}
export const roomKey = {
  user: (id) => `user:${id}`,
  conv: (id) => `conv:${id}`,
  focus: (id) => `focus:${id}`,
  canvas: (type, id) => `canvas:${type}:${id}`,
};
