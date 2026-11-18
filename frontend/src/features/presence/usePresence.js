import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../api/queryKeys.js';

const selectors = new Map();
const selectFor = (userId) => {
  if (!selectors.has(userId)) selectors.set(userId, (map) => map?.[userId]?.status || 'offline');
  return selectors.get(userId);
};

/** 'online' | 'away' | 'offline' for a user. Unknown users are offline (also how the server shows showPresence=false users). */
export function usePresence(userId) {
  const { data } = useQuery({
    queryKey: queryKeys.presence(), queryFn: () => ({}), enabled: false, staleTime: Infinity, initialData: {}, select: selectFor(userId),
  });
  return userId ? data : 'offline';
}
