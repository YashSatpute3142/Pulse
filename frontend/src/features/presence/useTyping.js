import { useSyncExternalStore } from 'react';
import { getTyping, subscribeTyping } from './typingStore.js';

/** User ids currently typing in a conversation (frozen array; stable between changes). */
export function useTyping(conversationId) {
  return useSyncExternalStore(subscribeTyping, () => getTyping(conversationId), () => getTyping(conversationId));
}
