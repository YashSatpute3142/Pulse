// Presence is live socket state, owned by Chat 04 (WEBSOCKET_PROTOCOL 8). HTTP only needs to READ it (GET /activity/feed), so this
// module is a tiny seam: Chat 04 registers a provider at startup; until then everyone is reported offline.
import { User } from '../models/User.js';

let provider = null;

/** @param {(userIds: string[]) => Promise<Map<string,'online'|'away'|'offline'>> | Map<string,'online'|'away'|'offline'>} fn */
export const setPresenceProvider = (fn) => { provider = fn; };

/** Map<userId, 'online'|'away'|'offline'>. Users with showPresence=false are ALWAYS offline (protocol 8). */
export async function getPresence(userIds) {
  const ids = [...new Set(userIds.map(String))];
  const out = new Map(ids.map((id) => [id, 'offline']));
  if (!ids.length || !provider) return out;
  const [live, users] = await Promise.all([
    Promise.resolve(provider(ids)),
    User.find({ _id: { $in: ids } }).select('settings.showPresence').lean(),
  ]);
  const hidden = new Set(users.filter((u) => u.settings?.showPresence === false).map((u) => String(u._id)));
  for (const id of ids) {
    const s = live?.get?.(id);
    out.set(id, hidden.has(id) || !['online', 'away'].includes(s) ? 'offline' : s);
  }
  return out;
}

/**
 * Persist the moment a user's last socket went away (protocol 8). Added by Chat 04 for Phase 4 because no service wrote User.lastSeenAt;
 * flagged for Chat 03 review. Atomic and monotonic: $max means a late/duplicate call can never move lastSeenAt backwards.
 */
export async function recordLastSeen(userId, at = new Date()) {
  await User.updateOne({ _id: userId }, { $max: { lastSeenAt: at } });
  return at;
}
