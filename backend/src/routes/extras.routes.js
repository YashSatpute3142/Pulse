import { Router } from 'express';
import * as c from '../controllers/extras.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { apiLimiter } from '../middleware/rateLimit.js';
import { idParam } from '../validators/common.js';
import { setActivityBody, roomListQuery, roomMessagesQuery, sparkQuery } from '../validators/extras.validators.js';

const guard = (limits) => [authenticate, apiLimiter(limits.api)];

export function activityRoutes(limits = {}) {
  const r = Router();
  r.use(...guard(limits));
  r.get('/me', c.activityMe);
  r.get('/feed', c.activityFeed);
  r.put('/me', validate({ body: setActivityBody }), c.activitySet);
  r.delete('/me', c.activityClear);
  return r;
}

export function focusRoutes(limits = {}) {
  const r = Router();
  r.use(...guard(limits));
  r.get('/', validate({ query: roomListQuery }), c.roomsList);
  r.get('/:id', validate({ params: idParam }), c.roomGet);
  r.get('/:id/messages', validate({ params: idParam, query: roomMessagesQuery }), c.roomMessages);
  return r;
}

export function pollRoutes(limits = {}) {
  const r = Router();
  r.use(...guard(limits));
  r.get('/:id', validate({ params: idParam }), c.pollGet);
  return r;
}

export function sparkRoutes(limits = {}) {
  const r = Router();
  r.use(...guard(limits));
  r.get('/random', validate({ query: sparkQuery }), c.sparkRandom);
  return r;
}
