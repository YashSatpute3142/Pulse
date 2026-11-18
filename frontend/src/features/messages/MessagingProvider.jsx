import { useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MessagingContext } from './messagingContext.js';
import { createOutbox } from './outbox.js';
import { makeOptimistic, patchByClientId, removeByClientId, upsertMessage } from './cache.js';
import { applyStoredMessage } from './cacheUpdates.js';
import { queryKeys } from '../../api/queryKeys.js';
import { eventBus } from '../../socket/eventBus.js';
import { registerMessageHandlers } from '../../socket/handlers/messages.js';
import { useSocket } from '../../socket/useSocket.js';
import { useAuth } from '../auth/useAuth.js';
import { uuid } from '../../utils/uuid.js';

/**
 * Owns the send path: optimistic row -> outbox (WebSocket CHAT_MESSAGE, queued offline) -> ACK replaces the row.
 * Also registers the messaging socket handlers. Components use useMessaging(); they never touch the socket.
 */
export function MessagingProvider({ children }) {
  const queryClient = useQueryClient();
  const { status, send } = useSocket();
  const { user } = useAuth();
  const meId = user?.id ?? null;
  const active = useRef(null);
  const meRef = useRef(meId);
  useEffect(() => { meRef.current = meId; });

  const outbox = useMemo(() => createOutbox({
    send,
    onAck: (_conversationId, message) => applyStoredMessage(queryClient, message),
    onStatus: (conversationId, clientId, st, error) => queryClient.setQueryData(
      queryKeys.conversations.messages(conversationId), (d) => patchByClientId(d, clientId, { _status: st, _error: error }),
    ),
  }), [queryClient, send]);

  useEffect(() => { if (status === 'open') outbox.flush(); }, [status, outbox]);

  useEffect(() => {
    const offs = registerMessageHandlers(eventBus, queryClient, { getMeId: () => meRef.current, getActiveConversationId: () => active.current });
    return () => offs.forEach((off) => off());
  }, [queryClient]);

  const value = useMemo(() => ({
    sendMessage({ conversationId, text, replyTo = null }) {
      const clientId = uuid();
      const optimistic = makeOptimistic({ clientId, conversationId, senderId: meRef.current, text, replyTo });
      queryClient.setQueryData(queryKeys.conversations.messages(conversationId), (d) => upsertMessage(d, optimistic));
      outbox.enqueue({ conversationId, clientId, payload: { text, ...(replyTo ? { replyTo: replyTo.id } : {}) } });
      return clientId;
    },
    retry: (clientId) => outbox.retry(clientId),
    discard(conversationId, clientId) {
      outbox.discard(clientId);
      queryClient.setQueryData(queryKeys.conversations.messages(conversationId), (d) => removeByClientId(d, clientId));
    },
    setActiveConversation: (id) => { active.current = id; },
  }), [queryClient, outbox]);

  return <MessagingContext.Provider value={value}>{children}</MessagingContext.Provider>;
}
