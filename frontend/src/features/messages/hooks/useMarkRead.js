import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { conversationsApi } from '../../../api/endpoints/conversations.js';
import { setUnreadZero } from '../cacheUpdates.js';

/** Returns markRead(messageId). Zeroes unread optimistically, tells the server, never repeats the same id. */
export function useMarkRead(conversationId) {
  const qc = useQueryClient();
  const last = useRef(null);
  return useCallback((messageId) => {
    if (!messageId || last.current === messageId) return;
    last.current = messageId;
    setUnreadZero(qc, conversationId, messageId);
    conversationsApi.markRead(conversationId, messageId).catch(() => { last.current = null; }); // retried on the next trigger
  }, [qc, conversationId]);
}
