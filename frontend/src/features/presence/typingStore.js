// Ephemeral "who is typing" state (never persisted, not server data). The server auto-stops after 5 s; we expire
// locally after 6 s in case the stop event is lost. Keyed conversationId -> Set(userId).
const EXPIRE_MS = 6000;
const typing = new Map(); // conversationId -> Map(userId -> timeout)
const listeners = new Set();
let snapshots = new Map(); // conversationId -> frozen array (stable identity for useSyncExternalStore)
const EMPTY = Object.freeze([]);

const emit = () => listeners.forEach((l) => l());
function refresh(conversationId) {
  const m = typing.get(conversationId);
  snapshots = new Map(snapshots);
  if (m && m.size) snapshots.set(conversationId, Object.freeze([...m.keys()])); else snapshots.delete(conversationId);
  emit();
}

export function setTyping(conversationId, userId, isTyping) {
  let m = typing.get(conversationId);
  if (m?.has(userId)) clearTimeout(m.get(userId));
  if (!isTyping) {
    if (m?.delete(userId)) { if (!m.size) typing.delete(conversationId); refresh(conversationId); }
    return;
  }
  if (!m) { m = new Map(); typing.set(conversationId, m); }
  const had = m.has(userId);
  m.set(userId, setTimeout(() => setTyping(conversationId, userId, false), EXPIRE_MS));
  if (!had) refresh(conversationId);
}
export const clearAllTyping = () => { typing.forEach((m) => m.forEach(clearTimeout)); typing.clear(); snapshots = new Map(); emit(); };
export const subscribeTyping = (l) => { listeners.add(l); return () => listeners.delete(l); };
export const getTyping = (conversationId) => snapshots.get(conversationId) || EMPTY;
