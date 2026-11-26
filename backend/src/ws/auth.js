import { env } from '../config/env.js';
import { consumeTicket } from '../services/ticket.service.js';
import { me } from '../services/auth.service.js';

export const WS_PATH = '/ws';

export class UpgradeError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/**
 * Upgrade-time authentication (protocol Section 1, steps 2-4): path, Origin allowlist, one-time ticket, user still active.
 * A request without an Origin header (non-browser client) is accepted, same as the HTTP CORS policy; the ticket is still required.
 * Returns { userId }. Throws UpgradeError(403 | 401 | 404).
 */
export async function authenticateUpgrade(req) {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { throw new UpgradeError(400, 'Bad request'); }
  if (url.pathname !== WS_PATH) throw new UpgradeError(404, 'Not found');
  const origin = req.headers.origin;
  if (origin && !env.CLIENT_ORIGINS_LIST.includes(origin)) throw new UpgradeError(403, 'Origin not allowed');
  const entry = consumeTicket(url.searchParams.get('ticket'));
  if (!entry) throw new UpgradeError(401, 'Invalid or expired ticket');
  try { await me(entry.userId); } catch { throw new UpgradeError(401, 'Unauthenticated'); }
  return { userId: entry.userId };
}

const REASONS = { 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 500: 'Internal Server Error', 503: 'Service Unavailable' };
/** Reject before any WebSocket exists. */
export function rejectUpgrade(socket, status) {
  if (socket.destroyed) return;
  socket.write(`HTTP/1.1 ${status} ${REASONS[status] || 'Error'}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}
