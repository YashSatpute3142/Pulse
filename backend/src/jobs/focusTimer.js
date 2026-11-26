import { S2C } from '../constants/eventTypes.js';
import * as focus from '../services/focus.service.js';
import { roomKey } from '../ws/roomManager.js';

const TICK_MS = 15_000;
const SWEEP_EVERY_TICKS = 4;

/**
 * Focus-room timer (protocol Section 9). The server is the only timer authority:
 *  - arm(roomId, endsAt) sets a precise timer; at endsAt the service completes the room atomically and ROOM_COMPLETED is sent.
 *  - every 15 s ROOM_TIMER_UPDATE (drift correction) goes to the sockets that joined the room.
 *  - every 4th tick (60 s) a sweep completes anything whose timer was missed.
 *  - start() re-arms every running room from MongoDB, so a restart loses nothing (rooms that ended while the server was down complete immediately).
 * Completion goes through focus.service.completeRoomIfDue, which is atomic, so a timer and a sweep racing cannot complete a room twice.
 */
export function createFocusTimer({ rooms, broadcast, logger, tickMs = TICK_MS, sweepEvery = SWEEP_EVERY_TICKS }) {
  const armed = new Map(); // roomId -> { timeout, endsAt: Date }
  let tick = null;
  let ticks = 0;

  function announceCompleted(res) {
    const { participantIds, invitedIds } = res.audience;
    const roomId = res.room.id;
    if (res.systemMessage) broadcast.toUsers(participantIds, S2C.ROOM_MESSAGE_NEW, { roomId, message: res.systemMessage });
    broadcast.toUsers([...participantIds, ...invitedIds], S2C.ROOM_COMPLETED, { roomId, completedAt: res.completedAt, durationSec: res.durationSec });
    for (const s of rooms.members(roomKey.focus(roomId))) rooms.leave(roomKey.focus(roomId), s);
  }

  async function finish(roomId) {
    const entry = armed.get(roomId);
    armed.delete(roomId);
    try {
      const res = await focus.completeRoomIfDue(roomId);
      if (res) { announceCompleted(res); return; }
      if (entry && Date.now() < entry.endsAt.getTime()) arm(roomId, entry.endsAt); // fired a few ms early: try again
    } catch (err) { logger.error({ err, roomId }, 'focus timer: completing room failed'); }
  }

  function disarm(roomId) {
    const entry = armed.get(roomId);
    if (entry) { clearTimeout(entry.timeout); armed.delete(roomId); }
  }

  function arm(roomId, endsAt) {
    disarm(roomId);
    const end = new Date(endsAt);
    const timeout = setTimeout(() => finish(roomId), Math.max(0, end.getTime() - Date.now()) + 5);
    timeout.unref?.();
    armed.set(roomId, { timeout, endsAt: end });
  }

  async function sweep() {
    for (const res of await focus.completeDueRooms()) { disarm(res.room.id); announceCompleted(res); }
  }

  async function rearmAll() {
    for (const { id, endsAt } of await focus.listRunningRooms()) arm(id, endsAt);
  }

  return {
    arm, disarm, sweep, rearmAll,
    armedCount: () => armed.size,
    isArmed: (roomId) => armed.has(roomId),
    async start() {
      try { await rearmAll(); } catch (err) { logger.error({ err }, 'focus timer: re-arm from MongoDB failed'); }
      tick = setInterval(() => {
        ticks += 1;
        const serverNow = Date.now();
        for (const [roomId, { endsAt }] of armed) {
          broadcast.toRoom(roomKey.focus(roomId), S2C.ROOM_TIMER_UPDATE, { roomId, status: 'running', endsAt: endsAt.toISOString(), serverNow });
        }
        if (ticks % sweepEvery === 0) sweep().catch((err) => logger.error({ err }, 'focus timer: sweep failed'));
      }, tickMs);
      tick.unref?.();
    },
    shutdown() { if (tick) clearInterval(tick); tick = null; for (const { timeout } of armed.values()) clearTimeout(timeout); armed.clear(); },
  };
}
