// Pure helpers over the messages infinite query: pages are newest-first, each page's data is newest-first.
// Optimistic rows carry { clientId, _status: 'sending' | 'failed', _error } and id = `tmp-${clientId}`.
const mapPages = (data, fn) => (data ? { ...data, pages: data.pages.map((p) => ({ ...p, data: fn(p.data) })) } : data);

export const tempId = (clientId) => `tmp-${clientId}`;

/** Ascending (oldest -> newest) list for rendering. */
export function selectMessages(data) {
  if (!data) return [];
  const seen = new Set();
  const out = [];
  for (const p of data.pages) for (const m of p.data) { if (!seen.has(m.id)) { seen.add(m.id); out.push(m); } }
  return out.reverse();
}

/** Insert a new message at the newest end, or replace the existing one (by id, or by clientId for optimistic rows). */
export function upsertMessage(data, msg) {
  if (!data || !data.pages.length) return data;
  let found = false;
  const replaced = mapPages(data, (items) => items.map((m) => {
    if (m.id === msg.id || (msg.clientId && m.clientId === msg.clientId)) { found = true; return { ...msg }; }
    return m;
  }));
  if (found) return replaced;
  return { ...replaced, pages: replaced.pages.map((p, i) => (i === 0 ? { ...p, data: [msg, ...p.data] } : p)) };
}

export function patchMessage(data, id, patch) {
  return mapPages(data, (items) => items.map((m) => (m.id === id ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m)));
}
export function patchByClientId(data, clientId, patch) {
  return mapPages(data, (items) => items.map((m) => (m.clientId === clientId ? { ...m, ...patch } : m)));
}
export function removeByClientId(data, clientId) {
  return mapPages(data, (items) => items.filter((m) => m.clientId !== clientId || !m._status));
}

export function applyDeleted(data, id, deletedAt) {
  return patchMessage(data, id, { deletedAt, text: '', attachments: [], reactions: [] });
}

/** Toggle one user's reaction locally (optimistic). Mirrors the server rule: chips drop when no users remain. */
export function toggleReaction(reactions, emoji, userId, add) {
  const list = reactions.map((r) => ({ ...r, userIds: [...r.userIds] }));
  const i = list.findIndex((r) => r.emoji === emoji);
  if (add) {
    if (i === -1) list.push({ emoji, userIds: [userId] });
    else if (!list[i].userIds.includes(userId)) list[i].userIds.push(userId);
  } else if (i !== -1) {
    list[i].userIds = list[i].userIds.filter((u) => u !== userId);
  }
  return list.filter((r) => r.userIds.length);
}

export function makeOptimistic({ clientId, conversationId, senderId, text, replyTo, now = new Date() }) {
  return {
    id: tempId(clientId), clientId, conversationId, senderId, type: 'text', text, attachments: [],
    replyTo: replyTo ? { id: replyTo.id, senderId: replyTo.senderId, text: (replyTo.text || '').slice(0, 120), type: replyTo.type, deletedAt: replyTo.deletedAt } : null,
    pollId: null, reactions: [], editedAt: null, deletedAt: null, createdAt: now.toISOString(),
    _status: 'sending', _error: null,
  };
}
