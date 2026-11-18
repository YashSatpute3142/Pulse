import { dayKey, formatDayLabel } from '../../utils/time.js';
import { GROUP_GAP_MS } from './constants.js';

/**
 * Ascending messages -> render items: date separators, system lines and message rows with group flags.
 * A group = same sender, within 5 minutes, no date/system line between. `last` = last block of its group.
 * Keys use clientId first so an optimistic row keeps its DOM node when the server copy replaces it.
 */
export function buildItems(messages, meId, now = new Date()) {
  const items = [];
  let prev = null; let prevIdx = -1; let lastDay = null;
  for (const m of messages) {
    const day = dayKey(m.createdAt);
    if (day !== lastDay) { items.push({ type: 'date', key: `d-${day}`, label: formatDayLabel(m.createdAt, now) }); lastDay = day; prev = null; }
    if (m.type === 'system') { items.push({ type: 'system', key: m.id, message: m }); prev = null; continue; }
    const continued = prev && prev.senderId === m.senderId && new Date(m.createdAt) - new Date(prev.createdAt) <= GROUP_GAP_MS;
    items.push({ type: 'msg', key: m.clientId || m.id, message: m, own: m.senderId === meId, first: !continued, last: true });
    if (continued) items[prevIdx].last = false;
    prev = m; prevIdx = items.length - 1;
  }
  return items;
}

/** Other members whose read pointer has reached this message. Ids are ObjectId hex strings: lexicographic order = time order. */
export function seenByCount(message, readState, meId) {
  if (!readState || message.id.startsWith('tmp-')) return 0;
  return readState.filter((r) => r.userId !== meId && r.lastReadMessageId && r.lastReadMessageId >= message.id).length;
}

export function canEdit(message, meId, now = Date.now()) {
  return message.senderId === meId && message.type === 'text' && !message.deletedAt && !message._status && now - new Date(message.createdAt).getTime() <= 24 * 3600 * 1000;
}
export function canDelete(message, meId, role) {
  return !message.deletedAt && !message._status && message.type !== 'system' && (message.senderId === meId || role === 'admin' || role === 'owner');
}
