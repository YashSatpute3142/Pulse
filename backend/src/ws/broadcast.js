import { frame } from './envelope.js';

const OPEN = 1;
const SLOW_CONSUMER_BYTES = 2 * 1024 * 1024;

/** The only place that writes to sockets. Handlers say WHO (user ids or a room) and WHAT; they never hold sockets. */
export function createBroadcaster({ connections, rooms, logger }) {
  const write = (socket, text) => {
    if (socket.readyState !== OPEN) return;
    if (socket.bufferedAmount > SLOW_CONSUMER_BYTES) { logger?.warn({ userId: socket.meta?.userId }, 'ws slow consumer terminated'); socket.terminate(); return; }
    socket.send(text);
  };
  return {
    toSocket(socket, type, payload) { write(socket, frame(type, payload)); },
    toUsers(userIds, type, payload, { except } = {}) {
      const text = frame(type, payload);
      for (const id of new Set([...userIds].map(String))) for (const s of connections.socketsOf(id)) if (s !== except) write(s, text);
    },
    toRoom(key, type, payload, { except } = {}) {
      const text = frame(type, payload);
      for (const s of rooms.members(key)) if (s !== except) write(s, text);
    },
    raw: write,
  };
}
