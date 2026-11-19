import { S2C } from '../../constants/eventTypes.js';
import { queryKeys } from '../../api/queryKeys.js';
import { tokenStore } from '../../api/tokenStore.js';
import { sessionEvents } from '../../api/sessionEvents.js';
import { registerPresenceHandlers } from './presence.js';
import { registerFocusHandlers } from './focus.js';
import { registerPollHandlers } from './polls.js';
import { applyActivityChanged } from '../../features/activity/cache.js';

/**
 * Event -> TanStack Query cache. Phase 2 only wires session-level events.
 * Messaging handlers live in handlers/messages.js (registered by MessagingProvider). Presence/activity/rooms: Phases 4 and 5.
 */
export function registerSocketHandlers(bus, queryClient, { getMeId = () => null } = {}) {
  return [
    bus.subscribe(S2C.ACTIVITY_CHANGED, (p) => applyActivityChanged(queryClient, p || {}, getMeId())),
    ...registerPresenceHandlers(bus, queryClient),
    ...registerFocusHandlers(bus, queryClient),
    ...registerPollHandlers(bus, queryClient),
    // Friend changes (requests, accepts, removals) refresh the friends lists.
    bus.subscribe(S2C.FRIEND_UPDATED, () => queryClient.invalidateQueries({ queryKey: queryKeys.friends.all() })),
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
