/** Pure helpers over the Conversation shape (API_CONTRACT 3). `meId` is the signed-in user's id. */
export const otherMember = (conv, meId) => conv.members?.find((m) => m.user.id !== meId)?.user || null;

export function conversationTitle(conv, meId) {
  if (conv.type === 'group') return conv.title || 'Group';
  return otherMember(conv, meId)?.displayName || 'Conversation';
}
export function conversationAvatarUrl(conv, meId) {
  return conv.type === 'group' ? conv.avatarUrl || null : otherMember(conv, meId)?.avatarUrl || null;
}
export function conversationSubtitle(conv, meId) {
  if (conv.type === 'group') return `${conv.members.length} members`;
  const o = otherMember(conv, meId);
  return o ? `@${o.username}` : '';
}
export function memberById(conv, id) {
  return conv?.members?.find((m) => m.user.id === id)?.user || null;
}
export function myRole(conv, meId) {
  return conv?.members?.find((m) => m.user.id === meId)?.role || 'member';
}

/** One-line preview: "you: text" for own, "Name: text" in groups, plain text in direct chats. */
export function previewLine(conv, meId) {
  const lm = conv.lastMessage;
  if (!lm) return 'No messages yet';
  const text = lm.preview || (lm.type === 'image' ? 'Image' : lm.type === 'file' ? 'File' : lm.type === 'poll' ? 'Poll' : '');
  if (lm.senderId === meId) return `you: ${text}`;
  if (conv.type === 'group' && lm.senderId) {
    const name = memberById(conv, lm.senderId)?.displayName?.split(' ')[0];
    return name ? `${name}: ${text}` : text;
  }
  return text;
}
