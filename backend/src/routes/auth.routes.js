import { Router } from 'express';
import * as c from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { authLimiter, apiLimiter } from '../middleware/rateLimit.js';
import { originCheck } from '../middleware/originCheck.js';
import { registerBody, loginBody } from '../validators/auth.validators.js';

export function authRoutes(limits = {}) {
  const r = Router();
  const strict = authLimiter(limits.auth);
  const general = apiLimiter(limits.api);

  r.post('/register', strict, validate({ body: registerBody }), c.register);
  r.post('/login', strict, validate({ body: loginBody }), c.login);
  // Cookie-authenticated: CSRF origin check, IP-keyed general limiter.
  r.post('/refresh', originCheck, general, c.refresh);
  r.post('/logout', originCheck, general, c.logout);
  r.post('/ws-ticket', authenticate, general, c.wsTicket);
  r.get('/me', authenticate, general, c.me);
  return r;
}
