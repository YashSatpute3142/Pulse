import { Router } from 'express';
import * as c from '../controllers/friend.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { apiLimiter } from '../middleware/rateLimit.js';
import { sendRequestBody, userIdParam } from '../validators/friend.validators.js';

export function friendRoutes(limits = {}) {
  const r = Router();
  r.use(authenticate, apiLimiter(limits.api));
  r.get('/', c.list);
  r.get('/requests', c.requests);
  r.post('/requests', validate({ body: sendRequestBody }), c.sendRequest);
  r.post('/requests/:userId/accept', validate({ params: userIdParam }), c.accept);
  r.post('/requests/:userId/decline', validate({ params: userIdParam }), c.decline);
  r.post('/:userId/block', validate({ params: userIdParam }), c.block);
  r.delete('/:userId/block', validate({ params: userIdParam }), c.unblock);
  r.delete('/:userId', validate({ params: userIdParam }), c.remove);
  return r;
}
