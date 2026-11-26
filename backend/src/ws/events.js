import { events, EVENTS } from '../utils/events.js';
import { S2C, WS_CLOSE } from '../constants/eventTypes.js';
import * as conversationService from '../services/conversation.service.js';
import { activityAudience } from '../services/activity.service.js';
import { me } from '../services/auth.service.js';
import { roomKey } from './roomManager.js';

/**
 * Service events (utils/events.js) -> sockets. Services never import ws code; this module is the only subscriber.
 * Every listener is async-safe: a failure is logged and never reaches the process.
 */
export function bindServiceEvents({ connections, rooms, broadcast, logger }) {
  const listeners = [];
  const on = (name, fn) => {
    const wrapped = (e) => { Promise.resolve().then(() => fn(e)).catch((err) => logger.error({ err, event: name }, 'ws event fan-out failed')); };
    events.on(name, wrapped);
    listeners.push([name, wrapped]);
  };

  // logout / password change -> tell every socket of the user, then close 4002 (client goes to login).
  on(EVENTS.SESSION_REVOKED, ({ userId }) => {
    for (const s of connections.socketsOf(userId)) {
      broadcast.toSocket(s, S2C.SESSION_REVOKED, {});
      s.close(WS_CLOSE.SESSION_REVOKED, 'session revoked');
    }
  });

  // `friendship` is already from the recipient's point of view (a block is never revealed to the blocked user).
  on(EVENTS.FRIEND_UPDATED, ({ recipientId, userId, friendship }) => {
    broadcast.toUsers([recipientId], S2C.FRIEND_UPDATED, { userId, friendship });
  });

  // unreadCount etc. are per user: one payload per member, built by the service. Members' sockets are (re)joined to conv:<id>.
  on(EVENTS.CONVERSATION_UPDATED, async ({ conversationId, memberIds }) => {
    for (const memberId of memberIds) {
      const sockets = connections.socketsOf(memberId);
      if (!sockets.length) continue;
      const conversation = await conversationService.getConversationForUser(conversationId, memberId);
      if (!conversation) continue;
      for (const s of sockets) { rooms.join(roomKey.conv(conversationId), s); broadcast.toSocket(s, S2C.CONVERSATION_UPDATED, { conversation }); }
    }
  });

  on(EVENTS.CONVERSATION_REMOVED, ({ conversationId, userId }) => {
    const sockets = connections.socketsOf(userId);
    for (const s of sockets) { broadcast.toSocket(s, S2C.CONVERSATION_REMOVED, { conversationId }); rooms.leave(roomKey.conv(conversationId), s); }
  });

  // Read receipts: everyone in the conversation sees them unless the reader turned showReadReceipts off; then only the reader's own tabs.
  on(EVENTS.MESSAGE_READ, async ({ conversationId, userId, lastReadMessageId }) => {
    const payload = { conversationId, userId, lastReadMessageId };
    const reader = await me(userId);
    if (reader.settings?.showReadReceipts === false) broadcast.toUsers([userId], S2C.MESSAGE_READ_UPDATED, payload);
    else broadcast.toRoom(roomKey.conv(conversationId), S2C.MESSAGE_READ_UPDATED, payload);
  });

  // Activity: friends who may see it (visibility-filtered by the service) get the activity; the owner's own tabs always do.
  // If the new visibility is 'nobody', friends get `null` so a previously visible activity disappears for them.
  on(EVENTS.ACTIVITY_CHANGED, async ({ userId, activity }) => {
    const visibility = activity?.visibility ?? 'friends'; // cleared: tell every friend, a clear reveals nothing
    const friends = await activityAudience(userId, visibility === 'nobody' ? 'friends' : visibility);
    if (visibility === 'nobody') broadcast.toUsers(friends, S2C.ACTIVITY_CHANGED, { userId, activity: null });
    else broadcast.toUsers(friends, S2C.ACTIVITY_CHANGED, { userId, activity });
    broadcast.toUsers([userId], S2C.ACTIVITY_CHANGED, { userId, activity });
  });

  return () => { for (const [name, fn] of listeners) events.off(name, fn); };
}
