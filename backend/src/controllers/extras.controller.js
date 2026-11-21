import * as activity from '../services/activity.service.js';
import * as focus from '../services/focus.service.js';
import * as polls from '../services/poll.service.js';
import { randomSpark } from '../services/spark.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const activityMe = asyncHandler(async (req, res) => res.json({ data: await activity.getMine(req.user.id) }));
export const activityFeed = asyncHandler(async (req, res) => res.json({ data: await activity.feed(req.user.id) }));
export const activitySet = asyncHandler(async (req, res) => res.json({ data: await activity.setActivity(req.user.id, req.valid.body) }));
export const activityClear = asyncHandler(async (req, res) => { await activity.clearActivity(req.user.id); res.status(204).end(); });

export const roomsList = asyncHandler(async (req, res) => res.json({ data: await focus.listRooms(req.user.id, req.valid.query.scope) }));
export const roomGet = asyncHandler(async (req, res) => res.json({ data: await focus.getRoom(req.user.id, req.valid.params.id) }));
export const roomMessages = asyncHandler(async (req, res) => {
  const { items, hasMore, nextCursor } = await focus.listRoomMessages(req.user.id, req.valid.params.id, req.valid.query);
  res.json({ data: items, meta: { hasMore, nextCursor } });
});

export const pollGet = asyncHandler(async (req, res) => res.json({ data: await polls.getPoll(req.user.id, req.valid.params.id) }));
export const sparkRandom = asyncHandler(async (req, res) => res.json({ data: randomSpark(req.valid.query.kind, req.valid.query.exclude) }));
