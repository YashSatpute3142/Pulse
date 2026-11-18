import { S2C } from '../../constants/eventTypes.js';
import { queryKeys } from '../../api/queryKeys.js';
import {
  applyConversationRemoved, applyConversationUpdated, applyDeletedEvent, applyEdited, applyReactions,
  applyReadUpdated, applyStoredMessage, isInUnfilteredList,
} from '../../features/messages/cacheUpdates.js';

const LIST_REFRESH_MS = 1000;

/**
 * Messaging events -> TanStack Query cache (hot paths use setQueryData, cold ones invalidate).
 *
 * Unread counts: the protocol says CONVERSATION_UPDATED carries the member's own unreadCount, but does not say it fires
 * for every message. So a message from someone else triggers a debounced refetch of the unfiltered list: correct whether
 * or not the server also pushes CONVERSATION_UPDATED, and at most one request per second.
 */
export function registerMessageHandlers(bus, queryClient, { getMeId, getActiveConversationId }) {
  let refreshTimer = null;
  const scheduleListRefresh = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => queryClient.invalidateQueries({ queryKey: queryKeys.conversations.lists() }), LIST_REFRESH_MS);
  };

  const offs = [
    bus.subscribe(S2C.MESSAGE_NEW, ({ message }) => {
      if (!message) return;
      applyStoredMessage(queryClient, message);
      const fromOther = message.senderId !== getMeId();
      const unknown = !isInUnfilteredList(queryClient, message.conversationId);
      const viewing = getActiveConversationId() === message.conversationId && !document.hidden;
      if (unknown || (fromOther && !viewing)) scheduleListRefresh();
    }),
    bus.subscribe(S2C.MESSAGE_EDITED, (p) => applyEdited(queryClient, p)),
    bus.subscribe(S2C.MESSAGE_DELETED, (p) => applyDeletedEvent(queryClient, p)),
    bus.subscribe(S2C.MESSAGE_REACTION_UPDATED, (p) => applyReactions(queryClient, p)),
    bus.subscribe(S2C.MESSAGE_READ_UPDATED, (p) => applyReadUpdated(queryClient, p, getMeId())),
    bus.subscribe(S2C.CONVERSATION_UPDATED, ({ conversation }) => conversation && applyConversationUpdated(queryClient, conversation)),
    bus.subscribe(S2C.CONVERSATION_REMOVED, ({ conversationId }) => conversationId && applyConversationRemoved(queryClient, conversationId)),
  ];
  return [...offs, () => clearTimeout(refreshTimer)];
}
