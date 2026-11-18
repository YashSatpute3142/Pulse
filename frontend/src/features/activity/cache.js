import { queryKeys } from '../../api/queryKeys.js';

const isLive = (a, now) => !!a && !(a.expiresAt && new Date(a.expiresAt).getTime() <= now);

/**
 * ACTIVITY_CHANGED { userId, activity|null } -> feed cache ([{ user, activity, presence }]).
 * Mine goes to the 'me' cache. A user we do not know yet (first activity of a friend) is not in the feed, so refetch.
 */
export function applyActivityChanged(queryClient, { userId, activity }, meId, now = Date.now()) {
  if (!userId) return;
  if (userId === meId) { queryClient.setQueryData(queryKeys.activity.me(), activity ?? null); return; }
  const feed = queryClient.getQueryData(queryKeys.activity.feed());
  const has = feed?.some((e) => e.user.id === userId);
  if (!isLive(activity, now)) {
    if (has) queryClient.setQueryData(queryKeys.activity.feed(), feed.filter((e) => e.user.id !== userId));
    return;
  }
  if (has) queryClient.setQueryData(queryKeys.activity.feed(), feed.map((e) => (e.user.id === userId ? { ...e, activity } : e)));
  else queryClient.invalidateQueries({ queryKey: queryKeys.activity.feed() });
}

/** Feed rows that are still live (expired ones are hidden even if the server has not cleared them yet). */
export const liveEntries = (feed, now) => (feed || []).filter((e) => isLive(e.activity, now));
