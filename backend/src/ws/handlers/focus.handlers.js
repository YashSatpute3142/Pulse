import { C2S, S2C } from '../../constants/eventTypes.js';
import * as v from '../../validators/ws.validators.js';
import * as focus from '../../services/focus.service.js';
import { me } from '../../services/auth.service.js';
import { roomKey } from '../roomManager.js';

/**
 * Focus Rooms (protocol Section 5/6/9). The service decides access, host-only rules and state; these handlers deliver what it returns.
 * Delivery goes to the user ids of the audience the service returns for that change (all of their tabs), not only to sockets that joined
 * `focus:<id>`: the frontend relies on it to refresh the room lists and to update the sender's own screen (start/cancel/message have
 * no ACK-driven update). `focus:<id>` tracks the sockets that opened the room (ROOM_JOIN) and is used for timer drift updates.
 */
const publicUser = async (userId) => {
  const m = await me(userId);
  return { id: m.id, username: m.username, displayName: m.displayName, avatarUrl: m.avatarUrl, bio: m.bio, createdAt: m.createdAt };
};
const leaveFocusRoom = (ctx, userId, roomId) => { for (const s of ctx.connections.socketsOf(userId)) ctx.rooms.leave(roomKey.focus(roomId), s); };
const emptyFocusRoom = (ctx, roomId) => { for (const s of ctx.rooms.members(roomKey.focus(roomId))) ctx.rooms.leave(roomKey.focus(roomId), s); };

export const focusHandlers = [
  {
    type: C2S.ROOM_CREATE, schema: v.roomCreatePayload,
    async run(ctx, payload) {
      const { room, newlyInvited } = await focus.createRoom(ctx.userId, payload);
      const invitedBy = room.participants.find((p) => p.user.id === room.hostId)?.user;
      return { data: { room }, after: () => ctx.broadcast.toUsers(newlyInvited, S2C.ROOM_INVITED, { room, invitedBy }) };
    },
  },
  {
    type: C2S.ROOM_INVITE, schema: v.roomInvitePayload,
    async run(ctx, { roomId, userIds }) {
      const { room, newlyInvited, audience } = await focus.inviteUsers(ctx.userId, roomId, userIds);
      const invitedBy = room.participants.find((p) => p.user.id === room.hostId)?.user;
      return {
        data: { room },
        after: () => {
          ctx.broadcast.toUsers(newlyInvited, S2C.ROOM_INVITED, { room, invitedBy });
          ctx.broadcast.toUsers(audience.participantIds, S2C.ROOM_STATE, { room, serverNow: Date.now() });
        },
      };
    },
  },
  {
    type: C2S.ROOM_JOIN, schema: v.roomIdPayload,
    async run(ctx, { roomId }) {
      const r = await focus.joinRoom(ctx.userId, roomId);
      ctx.rooms.join(roomKey.focus(roomId), ctx.socket);
      const data = { room: r.room, messages: r.messages, serverNow: r.serverNow.getTime() };
      if (!r.joined) return data;
      const user = r.room.participants.find((p) => p.user.id === ctx.userId)?.user;
      return {
        data,
        after: () => {
          // The joining socket already has the room and the join line in its ACK.
          ctx.broadcast.toUsers(r.audience.participantIds, S2C.ROOM_PARTICIPANT_JOINED, { roomId, user, at: Date.now() }, { except: ctx.socket });
          if (r.systemMessage) ctx.broadcast.toUsers(r.audience.participantIds, S2C.ROOM_MESSAGE_NEW, { roomId, message: r.systemMessage }, { except: ctx.socket });
        },
      };
    },
  },
  {
    type: C2S.ROOM_LEAVE, schema: v.roomIdPayload,
    async run(ctx, { roomId }) {
      const r = await focus.leaveRoom(ctx.userId, roomId);
      const user = r.left ? await publicUser(ctx.userId) : null;
      leaveFocusRoom(ctx, ctx.userId, roomId);
      return {
        data: {},
        after: () => {
          if (r.cancelled) {
            ctx.focusTimer.disarm(roomId);
            ctx.broadcast.toUsers([...r.audience.participantIds, ...r.audience.invitedIds], S2C.ROOM_CANCELLED, { roomId });
            emptyFocusRoom(ctx, roomId);
          } else if (r.left) {
            const others = r.audience.participantIds.filter((id) => id !== ctx.userId);
            ctx.broadcast.toUsers(others, S2C.ROOM_PARTICIPANT_LEFT, { roomId, user, at: Date.now() });
            if (r.systemMessage) ctx.broadcast.toUsers(others, S2C.ROOM_MESSAGE_NEW, { roomId, message: r.systemMessage });
          }
        },
      };
    },
  },
  {
    type: C2S.ROOM_START, schema: v.roomIdPayload,
    async run(ctx, { roomId }) {
      const r = await focus.startRoom(ctx.userId, roomId);
      ctx.focusTimer.arm(roomId, r.room.endsAt);
      const serverNow = r.serverNow.getTime();
      return {
        data: { room: r.room, serverNow },
        after: () => {
          const to = r.audience.participantIds;
          ctx.broadcast.toUsers(to, S2C.ROOM_STATE, { room: r.room, serverNow });
          ctx.broadcast.toUsers(to, S2C.ROOM_TIMER_UPDATE, { roomId, status: 'running', endsAt: r.room.endsAt, serverNow });
          if (r.systemMessage) ctx.broadcast.toUsers(to, S2C.ROOM_MESSAGE_NEW, { roomId, message: r.systemMessage });
        },
      };
    },
  },
  {
    type: C2S.ROOM_CANCEL, schema: v.roomIdPayload,
    async run(ctx, { roomId }) {
      const r = await focus.cancelRoom(ctx.userId, roomId);
      return {
        data: { room: r.room },
        after: () => {
          if (!r.changed) return;
          ctx.focusTimer.disarm(roomId);
          // Invited users are told too, so their "joinable" list refreshes (Section 6 lists participants only).
          ctx.broadcast.toUsers([...r.audience.participantIds, ...r.audience.invitedIds], S2C.ROOM_CANCELLED, { roomId });
          emptyFocusRoom(ctx, roomId);
        },
      };
    },
  },
  {
    type: C2S.ROOM_MESSAGE, schema: v.roomMessagePayload,
    async run(ctx, { roomId, text }) {
      const { message, audience } = await focus.sendRoomMessage(ctx.userId, roomId, text);
      // The sender's socket is included: the frontend has no optimistic row and shows the message when the event arrives (it de-duplicates by id).
      return { data: { message }, after: () => ctx.broadcast.toUsers(audience.participantIds, S2C.ROOM_MESSAGE_NEW, { roomId, message }) };
    },
  },
];
