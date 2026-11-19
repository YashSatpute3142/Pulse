import { S2C } from '../../constants/eventTypes.js';
import { queryKeys } from '../../api/queryKeys.js';
import { applyCancelled, applyCompleted, applyJoined, applyLeft, applyMessage, applyState, applyTimer } from '../../features/focus/cache.js';

/** ROOM_* events -> the room cache (only rooms that are currently cached, i.e. opened) and the list queries. */
export function registerFocusHandlers(bus, queryClient) {
  const patch = (roomId, fn) => { if (roomId) queryClient.setQueryData(queryKeys.focusRooms.detail(roomId), (d) => (d ? fn(d) : d)); };
  const refreshLists = () => queryClient.invalidateQueries({ queryKey: queryKeys.focusRooms.lists() });
  return [
    bus.subscribe(S2C.ROOM_INVITED, refreshLists),
    bus.subscribe(S2C.ROOM_STATE, (p) => { patch(p?.room?.id, (d) => applyState(d, p)); refreshLists(); }),
    bus.subscribe(S2C.ROOM_PARTICIPANT_JOINED, (p) => patch(p?.roomId, (d) => applyJoined(d, p))),
    bus.subscribe(S2C.ROOM_PARTICIPANT_LEFT, (p) => patch(p?.roomId, (d) => applyLeft(d, p))),
    bus.subscribe(S2C.ROOM_MESSAGE_NEW, (p) => patch(p?.roomId, (d) => applyMessage(d, p.message))),
    bus.subscribe(S2C.ROOM_TIMER_UPDATE, (p) => patch(p?.roomId, (d) => applyTimer(d, p))),
    bus.subscribe(S2C.ROOM_COMPLETED, (p) => { patch(p?.roomId, applyCompleted); refreshLists(); }),
    bus.subscribe(S2C.ROOM_CANCELLED, (p) => { patch(p?.roomId, applyCancelled); refreshLists(); }),
  ];
}
