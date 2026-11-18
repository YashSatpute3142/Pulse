import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { conversationsApi } from '../../../api/endpoints/conversations.js';
import { queryKeys } from '../../../api/queryKeys.js';
import { totalUnread } from '../cache.js';
import { applyConversationUpdated } from '../../messages/cacheUpdates.js';

/** Inbox (newest activity first). Pages are the raw { data, meta } bodies; cursor = meta.nextCursor. */
export function useConversations(q = '') {
  return useInfiniteQuery({
    queryKey: queryKeys.conversations.list(q),
    queryFn: ({ pageParam }) => conversationsApi.list({ q, before: pageParam }),
    initialPageParam: undefined,
    getNextPageParam: (last) => (last.meta?.hasMore ? last.meta.nextCursor : undefined),
  });
}

/** Sum of unread across loaded, non-muted conversations (nav badge). Shares the cache with the inbox. */
export function useUnreadTotal() {
  const { data } = useInfiniteQuery({
    queryKey: queryKeys.conversations.list(''),
    queryFn: ({ pageParam }) => conversationsApi.list({ q: '', before: pageParam }),
    initialPageParam: undefined,
    getNextPageParam: (last) => (last.meta?.hasMore ? last.meta.nextCursor : undefined),
    select: totalUnread,
  });
  return data || 0;
}

export function useConversation(id) {
  return useQuery({ queryKey: queryKeys.conversations.detail(id), queryFn: () => conversationsApi.get(id), enabled: !!id });
}

/** Creates (or returns the existing) conversation and puts it in the caches so it shows immediately. */
export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) => (input.type === 'group' ? conversationsApi.createGroup(input) : conversationsApi.createDirect(input.userId)),
    onSuccess: (conversation) => applyConversationUpdated(qc, conversation),
  });
}
