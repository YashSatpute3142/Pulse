import { C2S, S2C } from '../../constants/eventTypes.js';
import * as v from '../../validators/ws.validators.js';
import * as messages from '../../services/message.service.js';

/**
 * Messaging (protocol Section 5). Services authorize and persist; these only translate and broadcast.
 * Delivery goes to the `memberIds` the service returns for THAT write (authoritative), to every socket of those users except the
 * sending socket, which already has its ACK. MESSAGE_READ_UPDATED is emitted by message.service itself and fanned out in ws/events.js.
 */
export const messageHandlers = [
  {
    type: C2S.CHAT_MESSAGE, schema: v.chatMessagePayload,
    async run(ctx, payload) {
      const { message, memberIds, duplicate } = await messages.sendMessage(ctx.userId, payload);
      return {
        data: { message },
        after: duplicate ? null : () => ctx.broadcast.toUsers(memberIds, S2C.MESSAGE_NEW, { message }, { except: ctx.socket }),
      };
    },
  },
  {
    type: C2S.MESSAGE_EDIT, schema: v.messageEditPayload,
    async run(ctx, { messageId, text }) {
      const r = await messages.editMessage(ctx.userId, messageId, text);
      return {
        data: {},
        after: () => ctx.broadcast.toUsers(r.memberIds, S2C.MESSAGE_EDITED, { conversationId: r.conversationId, messageId: r.messageId, text: r.text, editedAt: r.editedAt }, { except: ctx.socket }),
      };
    },
  },
  {
    type: C2S.MESSAGE_DELETE, schema: v.messageDeletePayload,
    async run(ctx, { messageId }) {
      const r = await messages.deleteMessage(ctx.userId, messageId);
      return {
        data: {},
        after: () => ctx.broadcast.toUsers(r.memberIds, S2C.MESSAGE_DELETED, { conversationId: r.conversationId, messageId: r.messageId, deletedAt: r.deletedAt }, { except: ctx.socket }),
      };
    },
  },
  {
    type: C2S.MESSAGE_REACTION, schema: v.messageReactionPayload,
    async run(ctx, { messageId, emoji, action }) {
      const r = await messages.setReaction(ctx.userId, messageId, emoji, action);
      return {
        data: {},
        after: () => ctx.broadcast.toUsers(r.memberIds, S2C.MESSAGE_REACTION_UPDATED, { conversationId: r.conversationId, messageId: r.messageId, reactions: r.reactions }, { except: ctx.socket }),
      };
    },
  },
  {
    type: C2S.MESSAGE_READ, schema: v.messageReadPayload,
    async run(ctx, { conversationId, messageId }) {
      await messages.markRead(ctx.userId, conversationId, messageId);
      return {};
    },
  },
];
