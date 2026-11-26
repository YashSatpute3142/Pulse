import { z } from 'zod';
import { objectId } from './common.js';

// WS payload schemas (WEBSOCKET_PROTOCOL Section 5). Plain z.object strips unknown keys, so client-supplied identity fields
// (userId, senderId, sender...) never reach a service. Business rules stay in the services; these only check shape and size.
const clientId = z.string().min(8).max(64);
const attachment = z.object({
  kind: z.enum(['image', 'file']),
  url: z.string().max(500),
  name: z.string().max(200).optional(),
  mime: z.string().max(100),
  size: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
});

export const registerPayload = z.object({ activeConversationId: objectId.optional(), activeRoomId: objectId.optional() });
export const pingPayload = z.object({});

export const chatMessagePayload = z.object({
  conversationId: objectId,
  clientId,
  text: z.string().max(4000).optional(),
  attachments: z.array(attachment).max(5).optional(),
  replyTo: objectId.nullish(),
});
export const messageEditPayload = z.object({ messageId: objectId, text: z.string().min(1).max(4000) });
export const messageDeletePayload = z.object({ messageId: objectId });
export const messageReactionPayload = z.object({ messageId: objectId, emoji: z.string().min(1).max(16), action: z.enum(['add', 'remove']) });
export const messageReadPayload = z.object({ conversationId: objectId, messageId: objectId });

export const userStatusPayload = z.object({ status: z.enum(['online', 'away']) });
export const typingPayload = z.object({ conversationId: objectId });

// Activity / Focus Rooms / Polls. Shape and size only; every business rule (limits, friends-only invites, host-only, ...) is in the services.
export const activityUpdatePayload = z.object({
  type: z.string().max(30),
  label: z.string().max(200).optional(),
  visibility: z.string().max(20).optional(),
  expiresInMin: z.number().nullish(),
});
export const emptyPayload = z.object({});

export const roomCreatePayload = z.object({ title: z.string().max(200), durationSec: z.number(), inviteUserIds: z.array(objectId).max(50).optional() });
export const roomInvitePayload = z.object({ roomId: objectId, userIds: z.array(objectId).max(50) });
export const roomIdPayload = z.object({ roomId: objectId });
export const roomMessagePayload = z.object({ roomId: objectId, text: z.string().max(2000) });

export const pollCreatePayload = z.object({
  conversationId: objectId,
  question: z.string().max(500),
  options: z.array(z.string().max(300)).max(20),
  multiple: z.boolean().optional(),
  anonymous: z.boolean().optional(),
  closesInMin: z.number().nullish(),
});
export const pollVotePayload = z.object({ pollId: objectId, optionIds: z.array(z.string().max(20)).max(20) });
export const pollIdPayload = z.object({ pollId: objectId });
