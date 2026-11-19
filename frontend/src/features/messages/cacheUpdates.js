import { queryKeys } from '../../api/queryKeys.js';
import { applyDeleted, patchMessage, upsertMessage } from './cache.js';
import { flattenConversations, patchConversation, removeConversation, upsertConversation } from '../conversations/cache.js';

// Glue between pure cache helpers and a QueryClient. Used by socket handlers and the MessagingProvider.

/** Apply fn(data, isUnfilteredList) to every cached conversation list (the '' list and each search). */
export function updateLists(queryClient, fn) {
  queryClient.getQueriesData({ queryKey: queryKeys.conversations.lists() }).forEach(([key, data]) => {
    if (data) queryClient.setQueryData(key, fn(data, key[2] === ''));
  });
}

const preview = (m) => (m.deletedAt ? '' : (m.text || (m.type === 'poll' ? 'Poll' : m.attachments?.length ? (m.attachments[0].kind === 'image' ? 'Photo' : 'File') : '')).slice(0, 120));

/** A message was stored: put it in the message cache and refresh the conversation's lastMessage + order. */
export function applyStoredMessage(queryClient, message) {
  queryClient.setQueryData(queryKeys.conversations.messages(message.conversationId), (d) => upsertMessage(d, message));
  const lastMessage = { messageId: message.id, senderId: message.senderId, preview: preview(message), type: message.type, at: message.createdAt };
  updateLists(queryClient, (d) => upsertConversation(d, { id: message.conversationId, lastMessage, updatedAt: message.createdAt }, { insert: false }));
}

export function isInUnfilteredList(queryClient, conversationId) {
  return flattenConversations(queryClient.getQueryData(queryKeys.conversations.list(''))).some((c) => c.id === conversationId);
}

export function applyConversationUpdated(queryClient, conversation) {
  updateLists(queryClient, (d, unfiltered) => upsertConversation(d, conversation, { insert: unfiltered }));
  queryClient.setQueryData(queryKeys.conversations.detail(conversation.id), (old) => ({ ...(old || {}), ...conversation }));
}

export function applyConversationRemoved(queryClient, conversationId) {
  updateLists(queryClient, (d) => removeConversation(d, conversationId));
  queryClient.removeQueries({ queryKey: queryKeys.conversations.detail(conversationId) });
  queryClient.removeQueries({ queryKey: queryKeys.conversations.messages(conversationId) });
}

export const applyEdited = (qc, { conversationId, messageId, text, editedAt }) =>
  qc.setQueryData(queryKeys.conversations.messages(conversationId), (d) => patchMessage(d, messageId, { text, editedAt }));
export const applyDeletedEvent = (qc, { conversationId, messageId, deletedAt }) =>
  qc.setQueryData(queryKeys.conversations.messages(conversationId), (d) => applyDeleted(d, messageId, deletedAt));
export const applyReactions = (qc, { conversationId, messageId, reactions }) =>
  qc.setQueryData(queryKeys.conversations.messages(conversationId), (d) => patchMessage(d, messageId, { reactions }));

export function applyReadUpdated(queryClient, { conversationId, userId, lastReadMessageId }, meId) {
  queryClient.setQueryData(queryKeys.conversations.readState(conversationId), (old) => {
    if (!old) return old;
    const rest = old.filter((r) => r.userId !== userId);
    return [...rest, { userId, lastReadMessageId }];
  });
  if (userId === meId) { // read on another tab/device
    updateLists(queryClient, (d) => patchConversation(d, conversationId, { unreadCount: 0, lastReadMessageId }));
  }
}

export function setUnreadZero(queryClient, conversationId, lastReadMessageId) {
  updateLists(queryClient, (d) => patchConversation(d, conversationId, { unreadCount: 0, lastReadMessageId }));
  queryClient.setQueryData(queryKeys.conversations.detail(conversationId), (old) => (old ? { ...old, unreadCount: 0, lastReadMessageId } : old));
}
