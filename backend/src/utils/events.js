import { EventEmitter } from 'node:events';

/**
 * Tiny in-process event bus (ARCHITECTURE 2). Services emit; `ws/` (Chat 04) subscribes and decides who receives what.
 * Services must never import ws code. Payloads (all ids are strings):
 *
 *  session:revoked        { userId }                                   logout / password change: close the user's sockets
 *  friend:updated         { recipientId, userId, friendship }          -> WS FRIEND_UPDATED to `recipientId`. `userId` is the OTHER user;
 *                                                                      `friendship` is 'none'|'pending_in'|'pending_out'|'friends'|'blocked'
 *                                                                      from the recipient's point of view (a block is never revealed to the blocked user: they get 'none')
 *  conversation:updated   { conversationId, memberIds }                -> WS CONVERSATION_UPDATED. unreadCount etc. are per user, so build each payload
 *                                                                      with conversation.service.getConversationForUser(conversationId, memberId)
 *  conversation:removed   { conversationId, userId }                   -> WS CONVERSATION_REMOVED to `userId`; drop their sockets from conv:<id>
 *  activity:changed       { userId, activity|null }                    -> WS ACTIVITY_CHANGED. Emitted by activity.service for BOTH the WS and HTTP paths.
 *                                                                      Audience: activity.service.activityAudience(userId) (visibility-filtered); activity null = cleared
 *  message:read           { conversationId, userId, lastReadMessageId } -> WS MESSAGE_READ_UPDATED (filter by each viewer's showReadReceipts)
 *
 * Message writes (send / edit / delete / react) arrive through WS handlers, which call message.service and broadcast the
 * returned value themselves, so message.service does not emit for those.
 */
export const events = new EventEmitter();
events.setMaxListeners(50);
export const EVENTS = Object.freeze({
  SESSION_REVOKED: 'session:revoked',
  FRIEND_UPDATED: 'friend:updated',
  CONVERSATION_UPDATED: 'conversation:updated',
  CONVERSATION_REMOVED: 'conversation:removed',
  MESSAGE_READ: 'message:read',
  ACTIVITY_CHANGED: 'activity:changed',
});
