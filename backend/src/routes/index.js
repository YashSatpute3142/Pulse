import { Router } from 'express';
import { authRoutes } from './auth.routes.js';
import { userRoutes } from './user.routes.js';
import { friendRoutes } from './friend.routes.js';
import { conversationRoutes } from './conversation.routes.js';
import { uploadRoutes } from './upload.routes.js';
import { activityRoutes, focusRoutes, pollRoutes, sparkRoutes } from './extras.routes.js';
import { healthRoutes, timeRoutes } from './health.routes.js';

/** Mounted at /api/v1. Activity, focus rooms, polls and sparks were built by Chat 03 at the owner's request (ARCHITECTURE 7 lists Chat 06). */
export function apiRoutes(limits) {
  const r = Router();
  r.use(healthRoutes);
  r.use(timeRoutes);
  r.use('/auth', authRoutes(limits));
  r.use('/users', userRoutes(limits));
  r.use('/friends', friendRoutes(limits));
  r.use('/conversations', conversationRoutes(limits));
  r.use('/uploads', uploadRoutes(limits));
  r.use('/activity', activityRoutes(limits));
  r.use('/focus-rooms', focusRoutes(limits));
  r.use('/polls', pollRoutes(limits));
  r.use('/sparks', sparkRoutes(limits));
  return r;
}
