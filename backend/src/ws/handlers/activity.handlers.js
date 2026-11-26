import { C2S } from '../../constants/eventTypes.js';
import { activityUpdatePayload, emptyPayload } from '../../validators/ws.validators.js';
import * as activity from '../../services/activity.service.js';

/** The service emits ACTIVITY_CHANGED for both the HTTP and the WS path; ws/events.js fans it out per recipient. Handlers only call and ACK. */
export const activityHandlers = [
  {
    type: C2S.ACTIVITY_UPDATE, schema: activityUpdatePayload,
    async run(ctx, payload) { return { activity: await activity.setActivity(ctx.userId, payload) }; },
  },
  {
    type: C2S.ACTIVITY_CLEAR, schema: emptyPayload,
    async run(ctx) { await activity.clearActivity(ctx.userId); return {}; },
  },
];
