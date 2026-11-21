import { Router } from 'express';
import * as c from '../controllers/conversation.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { apiLimiter } from '../middleware/rateLimit.js';
import * as v from '../validators/conversation.validators.js';

export function conversationRoutes(limits = {}) {
  const r = Router();
  r.use(authenticate, apiLimiter(limits.api));

  r.get('/', validate({ query: v.listQuery }), c.list);
  r.post('/', validate({ body: v.createBody }), c.create);
  r.get('/:id', validate({ params: v.convParam }), c.get);
  r.patch('/:id', validate({ params: v.convParam, body: v.updateBody }), c.update);
  r.post('/:id/members', validate({ params: v.convParam, body: v.addMembersBody }), c.addMembers);
  r.delete('/:id/members/:userId', validate({ params: v.memberParam }), c.removeMember);
  r.post('/:id/read', validate({ params: v.convParam, body: v.readBody }), c.markRead);
  r.patch('/:id/mute', validate({ params: v.convParam, body: v.muteBody }), c.mute);

  r.get('/:id/messages', validate({ params: v.convParam, query: v.messagesQuery }), c.listMessages);
  r.get('/:id/messages/:messageId', validate({ params: v.messageParam }), c.getMessage);
  r.get('/:id/read-state', validate({ params: v.convParam }), c.readState);
  return r;
}
