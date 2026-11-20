import crypto from 'node:crypto';
import { env } from '../config/env.js';

/**
 * One-time WebSocket tickets (ARCHITECTURE D4). In-memory by design: v1 is a single instance (D8) and tickets live ~30 s.
 *  issueTicket(userId)   -> used by POST /auth/ws-ticket (HTTP side, Chat 03)
 *  consumeTicket(ticket) -> used by the WS upgrade handler (Chat 04, ws/auth.js). Returns { userId } or null.
 *                           A ticket works exactly once.
 */
const tickets = new Map(); // ticket -> { userId, expiresAt }

function sweep(now = Date.now()) {
  for (const [t, v] of tickets) if (v.expiresAt <= now) tickets.delete(t);
}
const timer = setInterval(sweep, 15_000);
timer.unref();

export function issueTicket(userId) {
  const ticket = crypto.randomBytes(32).toString('base64url');
  tickets.set(ticket, { userId: String(userId), expiresAt: Date.now() + env.WS_TICKET_TTL_SEC * 1000 });
  return { ticket, expiresInSec: env.WS_TICKET_TTL_SEC };
}

export function consumeTicket(ticket) {
  if (typeof ticket !== 'string') return null;
  const entry = tickets.get(ticket);
  if (!entry) return null;
  tickets.delete(ticket); // one-time, even if expired
  return entry.expiresAt > Date.now() ? { userId: entry.userId } : null;
}

export const _ticketCount = () => tickets.size; // test helper
