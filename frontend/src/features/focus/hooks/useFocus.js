import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { focusApi } from '../../../api/endpoints/focus.js';
import { queryKeys } from '../../../api/queryKeys.js';
import { C2S } from '../../../constants/eventTypes.js';
import { useSocket } from '../../../socket/useSocket.js';
import { useNow } from '../../../hooks/useNow.js';
import { fromJoin, remainingMs } from '../cache.js';

export const useFocusRooms = (scope) => useQuery({ queryKey: queryKeys.focusRooms.list(scope), queryFn: () => focusApi.list(scope) });

/** Joining happens over the socket (ROOM_JOIN ACK = room + last 50 messages + serverNow). Rejoins after a reconnect (list invalidation). */
export function useRoom(roomId) {
  const { status, send } = useSocket();
  return useQuery({
    queryKey: queryKeys.focusRooms.detail(roomId),
    queryFn: async () => fromJoin(await send(C2S.ROOM_JOIN, { roomId })),
    enabled: status === 'open',
    staleTime: Infinity, refetchOnMount: 'always', refetchOnWindowFocus: false, retry: false,
  });
}

/** Whole seconds-resolution remaining time, ticking every second. */
export function useRemaining(room, offset) {
  const now = useNow(1000);
  return room ? remainingMs(room, offset, now) : 0;
}

/** Room commands (all ACKed). Each returns a promise; callers show errors. */
export function useRoomActions() {
  const { send } = useSocket();
  const qc = useQueryClient();
  const create = useCallback(async ({ title, durationSec, inviteUserIds }) => {
    const data = await send(C2S.ROOM_CREATE, { title, durationSec, ...(inviteUserIds?.length ? { inviteUserIds } : {}) });
    qc.invalidateQueries({ queryKey: queryKeys.focusRooms.lists() });
    return data.room;
  }, [send, qc]);
  return useMemo(() => ({
    create,
    start: (roomId) => send(C2S.ROOM_START, { roomId }),
    cancel: (roomId) => send(C2S.ROOM_CANCEL, { roomId }),
    invite: (roomId, userIds) => send(C2S.ROOM_INVITE, { roomId, userIds }),
    message: (roomId, text) => send(C2S.ROOM_MESSAGE, { roomId, text }),
    leave: async (roomId) => {
      await send(C2S.ROOM_LEAVE, { roomId });
      qc.removeQueries({ queryKey: queryKeys.focusRooms.detail(roomId) });
      qc.invalidateQueries({ queryKey: queryKeys.focusRooms.lists() });
    },
  }), [create, send, qc]);
}
