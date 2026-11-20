import { Router } from 'express';
import * as c from '../controllers/user.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { authLimiter, apiLimiter } from '../middleware/rateLimit.js';
import { originCheck } from '../middleware/originCheck.js';
import { idParam } from '../validators/common.js';
import { searchQuery, updateProfileBody, updateSettingsBody, changePasswordBody } from '../validators/user.validators.js';

export function userRoutes(limits = {}) {
  const r = Router();
  r.use(authenticate, apiLimiter(limits.api));

  r.get('/search', validate({ query: searchQuery }), c.search);
  // /me routes are declared before /:id so "me" is never parsed as an id.
  r.patch('/me', validate({ body: updateProfileBody }), c.updateProfile);
  r.patch('/me/settings', validate({ body: updateSettingsBody }), c.updateSettings);
  r.post('/me/password', originCheck, authLimiter(limits.auth), validate({ body: changePasswordBody }), c.changePassword);
  r.get('/:id', validate({ params: idParam }), c.getProfile);
  return r;
}
