import { C2S, S2C } from '../../constants/eventTypes.js';
import { pingPayload, registerPayload } from '../../validators/ws.validators.js';
import * as conversationService from '../../services/conversation.service.js';
import { roomKey } from '../roomManager.js';

/** Re-sync this socket's conv:<id> rooms with the user's real memberships (decided by the service, never by the client). */
export async function syncConversationRooms(ctx, socket = ctx.socket) {
  const ids = new Set(await conversationService.listConversationIds(socket.meta.userId));
  if (socket.readyState > 1) return ids; // closed while we were waiting
  for (const key of [...socket.meta.rooms]) {
    if (key.startsWith('conv:') && !ids.has(key.slice(5))) ctx.rooms.leave(key, socket);
  }
  for (const id of ids) ctx.rooms.join(roomKey.conv(id), socket);
  return ids;
}

export const sessionHandlers = [
  {
    type: C2S.PING, schema: pingPayload, ack: false,
    run(ctx) { ctx.broadcast.toSocket(ctx.socket, S2C.PONG, {}); },
  },
  {
    type: C2S.REGISTER, schema: registerPayload,
    async run(ctx, payload) {
      await syncConversationRooms(ctx);
      ctx.socket.meta.active = { conversationId: payload.activeConversationId ?? null, roomId: payload.activeRoomId ?? null };
      return { presence: await ctx.presence.snapshot(ctx.socket) };
    },
  },
];
