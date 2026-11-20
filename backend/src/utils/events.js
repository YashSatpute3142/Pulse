import { EventEmitter } from 'node:events';

/**
 * Tiny in-process event bus (ARCHITECTURE 2). Services emit; `ws/` (Chat 04) subscribes.
 * Services must never import ws code. Emitted today by the auth/user services:
 *   'session:revoked' { userId }          logout / password change: close the user's sockets
 */
export const events = new EventEmitter();
events.setMaxListeners(50);
export const EVENTS = Object.freeze({ SESSION_REVOKED: 'session:revoked' });
