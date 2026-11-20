import { Router } from 'express';
import { health, time } from '../controllers/health.controller.js';

export const healthRoutes = Router().get('/health', health);
export const timeRoutes = Router().get('/time', time);
