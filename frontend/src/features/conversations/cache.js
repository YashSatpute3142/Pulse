// Pure helpers over TanStack infinite-query data: { pages: [{ data: Conversation[], meta }], pageParams }.
const mapPages = (data, fn) => (data ? { ...data, pages: data.pages.map((p) => ({ ...p, data: fn(p.data) })) } : data);
const byUpdatedDesc = (a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0);

export function flattenConversations(data) {
  return data ? data.pages.flatMap((p) => p.data) : [];
}

/**
 * Replace a conversation in place. When `insert` is true and it is not present, add it and keep the newest-first order
 * (only the unfiltered list inserts; search results only update entries they already hold).
 */
export function upsertConversation(data, conv, { insert }) {
  if (!data) return data;
  let found = false;
  const replaced = mapPages(data, (items) => items.map((c) => { if (c.id === conv.id) { found = true; return { ...c, ...conv }; } return c; }));
  if (found || !insert) return reorder(replaced);
  return reorder({ ...replaced, pages: replaced.pages.map((p, i) => (i === 0 ? { ...p, data: [conv, ...p.data] } : p)) });
}

/** Keep the first page ordered by updatedAt when a conversation's activity changed; later pages stay as fetched. */
function reorder(data) {
  if (!data?.pages.length) return data;
  const all = data.pages.flatMap((p) => p.data).sort(byUpdatedDesc);
  let i = 0;
  return { ...data, pages: data.pages.map((p) => { const n = p.data.length; const slice = all.slice(i, i + n); i += n; return { ...p, data: slice }; }) };
}

export function removeConversation(data, id) {
  return mapPages(data, (items) => items.filter((c) => c.id !== id));
}

export function patchConversation(data, id, patch) {
  return mapPages(data, (items) => items.map((c) => (c.id === id ? { ...c, ...(typeof patch === 'function' ? patch(c) : patch) } : c)));
}

export const totalUnread = (data) => flattenConversations(data).reduce((n, c) => n + (c.mutedUntil && new Date(c.mutedUntil) > new Date() ? 0 : c.unreadCount || 0), 0);
