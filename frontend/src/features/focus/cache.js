import { parseServerTime } from '../../socket/socketClient.js';

/**
 * Room cache entry: { room, messages (oldest first), offset }  where offset = serverNow - Date.now() at the last server event.
 * Remaining time = endsAt - (Date.now() + offset); display only, the server decides completion (protocol 9).
 */
const offsetOf = (serverNow, fallback = 0) => {
  const t = parseServerTime(serverNow);
  return t == null ? fallback : t - Date.now();
};
const byTime = (a, b) => new Date(a.createdAt) - new Date(b.createdAt);

export function fromJoin(data) {
  return { room: data.room, messages: [...(data.messages || [])].sort(byTime), offset: offsetOf(data.serverNow) };
}
export const applyState = (d, { room, serverNow }) => (d ? { ...d, room, offset: offsetOf(serverNow, d.offset) } : d);
export const applyTimer = (d, { status, endsAt, serverNow }) => (d ? { ...d, room: { ...d.room, status: status ?? d.room.status, endsAt: endsAt ?? d.room.endsAt }, offset: offsetOf(serverNow, d.offset) } : d);
export const applyCompleted = (d) => (d ? { ...d, room: { ...d.room, status: 'completed' } } : d);
export const applyCancelled = (d) => (d ? { ...d, room: { ...d.room, status: 'cancelled' } } : d);
export function applyJoined(d, { user, at }) {
  if (!d || !user || d.room.participants.some((p) => p.user.id === user.id)) return d;
  return { ...d, room: { ...d.room, participants: [...d.room.participants, { user, joinedAt: at }] } };
}
export const applyLeft = (d, { user }) => (d && user ? { ...d, room: { ...d.room, participants: d.room.participants.filter((p) => p.user.id !== user.id) } } : d);
export function applyMessage(d, message) {
  if (!d || !message || d.messages.some((m) => m.id === message.id)) return d;
  return { ...d, messages: [...d.messages, message].sort(byTime) };
}

export const remainingMs = (room, offset, now) => {
  if (room.status === 'running' && room.endsAt) return Math.max(0, new Date(room.endsAt).getTime() - (now + offset));
  if (room.status === 'lobby') return room.durationSec * 1000;
  return 0;
};
export function formatRemaining(ms) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
export const isHost = (room, meId) => room?.hostId === meId;
