// Shapes from API_CONTRACT Section 3. IDs are strings, dates are ISO strings (Date -> JSON does this).
const id = (v) => String(v);

export function toUser(u) {
  return {
    id: id(u._id),
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl ?? null,
    bio: u.bio ?? '',
    createdAt: u.createdAt,
  };
}

export function toMe(u) {
  const s = u.settings || {};
  return {
    ...toUser(u),
    email: u.email,
    settings: {
      theme: s.theme ?? 'system',
      activityVisibility: s.activityVisibility ?? 'friends',
      showPresence: s.showPresence ?? true,
      showReadReceipts: s.showReadReceipts ?? true,
    },
  };
}

// ---- friends / conversations / messages (API_CONTRACT 3) ----------------------------------------------------------

export const toFriend = (user, since, status) => ({ user: toUser(user), since, status });

const preview = (text, max = 120) => (text.length > max ? text.slice(0, max) : text);
export const previewText = preview;

export function toAttachment(a) {
  const out = { kind: a.kind, url: a.url, name: a.name ?? '', mime: a.mime ?? '', size: a.size ?? 0 };
  if (a.width != null) out.width = a.width;
  if (a.height != null) out.height = a.height;
  return out; // publicId is server-only and never exposed
}

/** replyPreviews: Map<idString, messageDoc> for the replied-to messages. */
export function toMessage(m, replyPreviews = new Map()) {
  const deleted = !!m.deletedAt;
  let replyTo = null;
  if (m.replyTo) {
    const r = replyPreviews.get(String(m.replyTo));
    replyTo = r
      ? { id: id(r._id), senderId: r.senderId ? id(r.senderId) : null, text: r.deletedAt ? '' : preview(r.text || ''), type: r.type, deletedAt: r.deletedAt ?? null }
      : { id: id(m.replyTo), senderId: null, text: '', type: 'text', deletedAt: new Date(0) }; // original no longer exists
  }
  const out = {
    id: id(m._id),
    conversationId: id(m.conversationId),
    senderId: m.senderId ? id(m.senderId) : null,
    type: m.type,
    text: deleted ? '' : m.text,
    attachments: deleted ? [] : (m.attachments || []).map(toAttachment),
    replyTo,
    pollId: m.pollId ? id(m.pollId) : null,
    reactions: (m.reactions || []).map((r) => ({ emoji: r.emoji, userIds: (r.users || []).map(id) })),
    editedAt: m.editedAt ?? null,
    deletedAt: m.deletedAt ?? null,
    createdAt: m.createdAt,
  };
  if (m.clientId) out.clientId = m.clientId;
  return out;
}

/** usersById: Map<idString, userDoc>. Only active members (leftAt == null) are listed; unread/read/mute are the viewer's own. */
export function toConversation(c, viewerId, usersById) {
  const mine = (c.members || []).find((x) => String(x.user) === String(viewerId));
  const members = (c.members || [])
    .filter((x) => !x.leftAt && usersById.get(String(x.user)))
    .map((x) => ({ user: toUser(usersById.get(String(x.user))), role: x.role }));
  const lm = c.lastMessage;
  return {
    id: id(c._id),
    type: c.type,
    title: c.type === 'group' ? (c.title ?? null) : null,
    avatarUrl: c.type === 'group' ? (c.avatarUrl ?? null) : null,
    members,
    lastMessage: lm && lm.messageId
      ? { messageId: id(lm.messageId), senderId: lm.senderId ? id(lm.senderId) : null, preview: lm.preview ?? '', type: lm.type ?? 'text', at: lm.at }
      : null,
    unreadCount: mine?.unreadCount ?? 0,
    lastReadMessageId: mine?.lastReadMessageId ? id(mine.lastReadMessageId) : null,
    mutedUntil: mine?.mutedUntil ?? null,
    updatedAt: c.updatedAt,
  };
}
