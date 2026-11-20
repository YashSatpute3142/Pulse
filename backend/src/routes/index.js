import { Router } from 'express';
import { authRoutes } from './auth.routes.js';
import { userRoutes } from './user.routes.js';
import { healthRoutes, timeRoutes } from './health.routes.js';

/** Mounted at /api/v1. Resource routers for friends, conversations, etc. are added in later steps. */
export function apiRoutes(limits) {
  const r = Router();
  r.use(healthRoutes);
  r.use(timeRoutes);
  r.use('/auth', authRoutes(limits));
  r.use('/users', userRoutes(limits));
  return r;
}
