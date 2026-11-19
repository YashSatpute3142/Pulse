import { useContext } from 'react';
import { MessagingContext } from './messagingContext.js';

/** { sendMessage({ conversationId, text, replyTo, attachments }), retry(clientId), discard(conversationId, clientId), setActiveConversation(id|null) } */
export function useMessaging() {
  const ctx = useContext(MessagingContext);
  if (!ctx) throw new Error('useMessaging must be used inside <MessagingProvider>');
  return ctx;
}
