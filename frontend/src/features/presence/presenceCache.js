import { queryKeys } from '../../api/queryKeys.js';

// Cache shape: { [userId]: { status: 'online'|'away'|'offline', lastSeenAt?: string } }. Filled only by socket events.
const VALID = new Set(['online', 'away', 'offline']);

export function applyPresence(queryClient, { userId, status, lastSeenAt }) {
  if (!userId || !VALID.has(status)) return;
  queryClient.setQueryData(queryKeys.presence(), (old = {}) => ({ ...old, [userId]: { status, lastSeenAt } }));
}

/**
 * REGISTER ACK snapshot. WEBSOCKET_PROTOCOL only says "{ presence snapshot }", so this accepts an array of
 * { userId, status } or a { [userId]: status | { status } } map (optionally under `presence`). Reported to Chat 00/04.
 * A snapshot replaces everything: statuses seen before a reconnect may be stale.
 */
export function applySnapshot(queryClient, data) {
  const raw = data?.presence ?? data;
  if (!raw || typeof raw !== 'object') return;
  const next = {};
  const entries = Array.isArray(raw) ? raw.map((e) => [e?.userId, e]) : Object.entries(raw);
  for (const [userId, v] of entries) {
    const status = typeof v === 'string' ? v : v?.status;
    if (userId && VALID.has(status)) next[userId] = { status, lastSeenAt: v?.lastSeenAt };
  }
  queryClient.setQueryData(queryKeys.presence(), next);
}
