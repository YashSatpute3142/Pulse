import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { conversationsApi } from '../../../api/endpoints/conversations.js';
import { queryKeys } from '../../../api/queryKeys.js';

/** Message history, newest first, cursor = meta.nextCursor (API_CONTRACT 4.5). Live events write into this cache. */
export function useMessages(conversationId) {
  return useInfiniteQuery({
    queryKey: queryKeys.conversations.messages(conversationId),
    queryFn: ({ pageParam }) => conversationsApi.messages(conversationId, { before: pageParam }),
    initialPageParam: undefined,
    getNextPageParam: (last) => (last.meta?.hasMore ? last.meta.nextCursor : undefined),
  });
}

export function useReadState(conversationId) {
  return useQuery({ queryKey: queryKeys.conversations.readState(conversationId), queryFn: () => conversationsApi.readState(conversationId) });
}
