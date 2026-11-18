import { S2C } from '../../constants/eventTypes.js';
import { applyPresence } from '../../features/presence/presenceCache.js';
import { setTyping } from '../../features/presence/typingStore.js';

/** PRESENCE_UPDATE -> presence cache; TYPING_UPDATE -> typing store; a new message from someone ends their typing. */
export function registerPresenceHandlers(bus, queryClient) {
  return [
    bus.subscribe(S2C.PRESENCE_UPDATE, (p) => applyPresence(queryClient, p || {})),
    bus.subscribe(S2C.TYPING_UPDATE, (p) => { if (p?.conversationId && p?.userId) setTyping(p.conversationId, p.userId, !!p.typing); }),
    bus.subscribe(S2C.MESSAGE_NEW, (p) => { const m = p?.message; if (m?.conversationId && m?.senderId) setTyping(m.conversationId, m.senderId, false); }),
  ];
}
