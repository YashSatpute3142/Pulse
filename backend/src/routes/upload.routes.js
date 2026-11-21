import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { uploadLimiter } from '../middleware/rateLimit.js';
import { uploadSingle } from '../middleware/upload.js';
import { upload } from '../controllers/upload.controller.js';

export function uploadRoutes(limits = {}) {
  const r = Router();
  // Authenticate and rate-limit BEFORE parsing the body, so unauthenticated clients cannot make the server buffer 10 MB.
  r.post('/', authenticate, uploadLimiter(limits.upload), uploadSingle, upload);
  return r;
}
