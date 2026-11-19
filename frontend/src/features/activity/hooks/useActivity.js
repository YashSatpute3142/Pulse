import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { activityApi } from '../../../api/endpoints/activity.js';
import { queryKeys } from '../../../api/queryKeys.js';

export const useActivityFeed = () => useQuery({ queryKey: queryKeys.activity.feed(), queryFn: activityApi.feed, staleTime: 30000 });

/** My own current activity (GET /activity/me), kept fresh by ACTIVITY_CHANGED for my id and by my own updates. null when none. */
export const useMyActivity = () => useQuery({ queryKey: queryKeys.activity.me(), queryFn: activityApi.me, staleTime: Infinity, refetchOnWindowFocus: false }).data ?? null;

export function useActivityMutations() {
  const qc = useQueryClient();
  const set = useMutation({
    mutationFn: activityApi.set,
    onSuccess: (data, vars) => {
      const now = new Date();
      qc.setQueryData(queryKeys.activity.me(), data?.type ? data : {
        type: vars.type, label: vars.label || '', visibility: vars.visibility || 'friends',
        startedAt: now.toISOString(), updatedAt: now.toISOString(),
        expiresAt: vars.expiresInMin ? new Date(now.getTime() + vars.expiresInMin * 60000).toISOString() : null,
      });
    },
  });
  const clear = useMutation({ mutationFn: activityApi.clear, onSuccess: () => qc.setQueryData(queryKeys.activity.me(), null) });
  return { set, clear };
}
