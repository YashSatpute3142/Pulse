import { dbStatus } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// API_CONTRACT 4.10 shows the raw object (not wrapped in { data }); kept literal for uptime monitors.
export const health = asyncHandler(async (_req, res) => {
  const db = await dbStatus();
  res.status(db === 'up' ? 200 : 503).json({ status: db === 'up' ? 'ok' : 'degraded', uptime: Math.round(process.uptime()), db });
});

export const time = (_req, res) => res.json({ data: { now: new Date().toISOString() } });
