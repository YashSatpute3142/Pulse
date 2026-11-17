import { S2C } from '../../constants/eventTypes.js';
import { queryKeys } from '../../api/queryKeys.js';
import { tokenStore } from '../../api/tokenStore.js';
import { sessionEvents } from '../../api/sessionEvents.js';

/**
 * Event -> TanStack Query cache. Phase 2 only wires session-level events.
 * Message/presence/activity/room handlers are added by the phases that own them (3, 4, 5).
 */
export function registerSocketHandlers(bus) {
  return [
    bus.subscribe(S2C.SESSION_REVOKED, () => {
      tokenStore.clear();
      sessionEvents.emit('expired', 'revoked');
    }),
  ];
}

/** After a reconnect the server does not replay; recover through HTTP (ARCHITECTURE 4). */
export function recoverAfterReconnect(queryClient) {
  // Prefix ['conversations'] covers list, detail and message pages. Narrowing to the active conversation's first page is Phase 3.
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.presence() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.activity.feed() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.focusRooms.all() }),
  ]);
}
