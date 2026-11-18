import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { friendsApi } from '../api/endpoints/friends.js';
import { queryKeys } from '../api/queryKeys.js';

// Shared by the Friends page and the new-conversation picker (features do not import each other).
export const useFriends = () => useQuery({ queryKey: queryKeys.friends.list(), queryFn: friendsApi.list });
export const useFriendRequests = () => useQuery({ queryKey: queryKeys.friends.requests(), queryFn: friendsApi.requests });

export function useFriendMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.friends.all() });
  const opts = { onSuccess: refresh };
  return {
    sendRequest: useMutation({ mutationFn: friendsApi.sendRequest, ...opts }),
    accept: useMutation({ mutationFn: friendsApi.accept, ...opts }),
    decline: useMutation({ mutationFn: friendsApi.decline, ...opts }),
    remove: useMutation({ mutationFn: friendsApi.remove, ...opts }),
    block: useMutation({ mutationFn: friendsApi.block, ...opts }),
  };
}
