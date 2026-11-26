import { WebSocketServer } from 'ws';
import { S2C, WS_CLOSE, WS_LIMITS } from '../constants/eventTypes.js';
import { logger as defaultLogger } from '../utils/logger.js';
import { authenticateUpgrade, rejectUpgrade, UpgradeError } from './auth.js';
import { createConnectionManager } from './connectionManager.js';
import { createRoomManager, roomKey } from './roomManager.js';
import { createBroadcaster } from './broadcast.js';
import { createRateLimiter, RATE_GROUPS } from './rateLimiter.js';
import { createRouter } from './router.js';
import { startHeartbeat } from './heartbeat.js';
import { bindServiceEvents } from './events.js';
import { sessionHandlers, syncConversationRooms } from './handlers/session.handlers.js';
import { messageHandlers } from './handlers/message.handlers.js';
import { presenceHandlers } from './handlers/presence.handlers.js';
import { activityHandlers } from './handlers/activity.handlers.js';
import { focusHandlers } from './handlers/focus.handlers.js';
import { pollHandlers } from './handlers/poll.handlers.js';
import { createFocusTimer } from '../jobs/focusTimer.js';
import { createPresenceManager } from './presence.js';
import { createTypingManager } from './typing.js';

// Phase 3: session + messaging. Phase 4: presence + typing. Phase 5: activity, focus rooms (+ timer job), polls. Later: canvas (6, see ws/handlers/README.md).
const ALL_HANDLERS = [...sessionHandlers, ...messageHandlers, ...presenceHandlers, ...activityHandlers, ...focusHandlers, ...pollHandlers];

/**
 * createWsServer(httpServer): native `ws` attached to the same http.Server (ARCHITECTURE 1). Returns { close(), stats(), ... }.
 * Options exist for tests (short heartbeat) and later phases (extra handlers, connect/disconnect hooks).
 */
export function createWsServer(httpServer, { logger = defaultLogger, heartbeatMs, heartbeatGraceMs, handlers = ALL_HANDLERS, maxSocketsPerUser, presenceGraceMs, typingExpireMs, focusTickMs, focusSweepEvery, rateGroups, onConnect = [], onDisconnect = [] } = {}) {
  const connections = createConnectionManager({ maxPerUser: maxSocketsPerUser });
  const rooms = createRoomManager();
  const broadcast = createBroadcaster({ connections, rooms, logger });
  const presence = createPresenceManager({ connections, rooms, broadcast, logger, graceMs: presenceGraceMs });
  const typing = createTypingManager({ connections, rooms, broadcast, expireMs: typingExpireMs });
  const focusTimer = createFocusTimer({ rooms, broadcast, logger, tickMs: focusTickMs, sweepEvery: focusSweepEvery });
  const router = createRouter({ handlers, broadcast, logger, onActivity: (socket) => presence.markActive(socket) });
  const wss = new WebSocketServer({ noServer: true, maxPayload: WS_LIMITS.MAX_FRAME_BYTES, perMessageDeflate: false });
  const ctxBase = { connections, rooms, broadcast, logger, presence, typing, focusTimer };
  let closing = false;

  const stopHeartbeat = startHeartbeat(connections, { intervalMs: heartbeatMs, graceMs: heartbeatGraceMs });
  const unbindEvents = bindServiceEvents(ctxBase);

  function onConnection(socket, userId) {
    socket.meta = { userId, connectedAt: Date.now(), rooms: new Set(), status: 'online', alive: true, queued: 0, chain: Promise.resolve(), limiter: createRateLimiter({ groups: rateGroups ? { ...RATE_GROUPS, ...rateGroups } : RATE_GROUPS }), active: { conversationId: null, roomId: null } };
    const ctx = { ...ctxBase, socket, userId };

    for (const old of connections.add(socket)) old.close(WS_CLOSE.TOO_MANY, 'too many connections');
    rooms.join(roomKey.user(userId), socket);

    socket.on('pong', () => { socket.meta.alive = true; });
    socket.on('error', (err) => { logger.debug({ err, userId }, 'ws socket error'); socket.terminate(); });
    socket.on('close', () => {
      const roomKeys = [...socket.meta.rooms]; // presence needs them for the offline audience after the rooms are released
      connections.remove(socket);
      rooms.leaveAll(socket);
      if (!connections.hasUser(userId)) typing.onUserGone(userId);
      presence.onDisconnect(socket, roomKeys);
      for (const fn of onDisconnect) { try { fn(ctx); } catch (err) { logger.error({ err }, 'ws onDisconnect failed'); } }
    });

    // Anything the client sends before READY waits behind this promise, so it is processed in order afterwards.
    socket.meta.chain = (async () => {
      try {
        await syncConversationRooms(ctx);
        for (const fn of onConnect) await fn(ctx);
        if (socket.readyState === 1) presence.onConnect(socket); // fire and forget: announcing online must not delay READY
        broadcast.toSocket(socket, S2C.READY, { userId, serverNow: Date.now(), heartbeatSec: Math.round((heartbeatMs ?? WS_LIMITS.HEARTBEAT_MS) / 1000) });
      } catch (err) {
        logger.error({ err, userId }, 'ws connect setup failed');
        socket.close(WS_CLOSE.INTERNAL, 'setup failed');
      }
    })();

    socket.on('message', (raw, isBinary) => { if (!closing) router.dispatch(socket, ctx, raw, isBinary); });
  }

  const onUpgrade = async (req, rawSocket, head) => {
    if (closing) { rejectUpgrade(rawSocket, 503); return; }
    rawSocket.on('error', () => {}); // a client that vanishes mid-handshake must not crash the process
    try {
      const { userId } = await authenticateUpgrade(req);
      if (rawSocket.destroyed) return;
      wss.handleUpgrade(req, rawSocket, head, (socket) => onConnection(socket, userId));
    } catch (err) {
      if (err instanceof UpgradeError) rejectUpgrade(rawSocket, err.status);
      else { logger.error({ err }, 'ws upgrade failed'); rejectUpgrade(rawSocket, 500); }
    }
  };
  httpServer.on('upgrade', onUpgrade);
  focusTimer.start(); // re-arms every running room from MongoDB (survives restarts)

  return {
    connections, rooms, broadcast, router, presence, typing, focusTimer,
    stats: () => ({ sockets: connections.size(), users: connections.userCount(), rooms: rooms.count() }),
    /** Graceful shutdown: stop accepting, close every socket with 1001, wait briefly, then terminate stragglers. */
    async close({ timeoutMs = 2000 } = {}) {
      if (closing) return;
      closing = true;
      httpServer.off('upgrade', onUpgrade);
      stopHeartbeat();
      presence.shutdown();
      typing.shutdown();
      focusTimer.shutdown();
      unbindEvents();
      const open = connections.all();
      await Promise.all(open.map((s) => new Promise((resolve) => {
        if (s.readyState === 3) { resolve(); return; }
        s.once('close', resolve);
        s.close(WS_CLOSE.GOING_AWAY, 'server shutting down');
        setTimeout(() => { s.terminate(); resolve(); }, timeoutMs).unref();
      })));
      await new Promise((resolve) => wss.close(resolve));
    },
  };
}
