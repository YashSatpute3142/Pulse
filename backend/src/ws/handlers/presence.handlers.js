import { C2S } from '../../constants/eventTypes.js';
import { userStatusPayload, typingPayload } from '../../validators/ws.validators.js';

/** Presence + typing (Phase 4). No business rules here: the managers own the state, services own membership and showPresence. */
export const presenceHandlers = [
  {
    type: C2S.USER_STATUS, schema: userStatusPayload,
    run(ctx, { status }) { ctx.presence.setStatus(ctx.socket, status); return {}; },
  },
  {
    type: C2S.TYPING_START, schema: typingPayload, ack: false,
    run(ctx, { conversationId }) { ctx.typing.start(ctx.socket, conversationId); },
  },
  {
    type: C2S.TYPING_STOP, schema: typingPayload, ack: false,
    run(ctx, { conversationId }) { ctx.typing.stop(ctx.socket, conversationId); },
  },
];
