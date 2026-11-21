import { FocusRoom } from '../models/FocusRoom.js';
import { RoomMessage } from '../models/RoomMessage.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { isValidId, toObjectId } from '../utils/ids.js';
import { toUser } from '../utils/serializers.js';
import { LIMITS } from '../constants/limits.js';
import { friendsAmong } from './access.service.js';

// Focus Rooms (API_CONTRACT 4.8, WEBSOCKET_PROTOCOL ROOM_*). HTTP reads live here; the write functions are called by Chat 04's
// WS handlers, which broadcast what they return (these functions do not emit). The server is the only timer authority (protocol 9).

const OPEN = ['lobby', 'running'];
const idStr = (v) => String(v);
const activeParticipants = (room) => (room.participants || []).filter((p) => !p.leftAt);
const isHost = (room, userId) => idStr(room.hostId) === idStr(userId);
const isActive = (room, userId) => activeParticipants(room).some((p) => idStr(p.user) === idStr(userId));
const isInvited = (room, userId) => (room.invited || []).some((i) => idStr(i) === idStr(userId));
const everJoined = (room, userId) => (room.participants || []).some((p) => idStr(p.user) === idStr(userId));
export const canAccess = (room, userId) => isHost(room, userId) || isActive(room, userId) || isInvited(room, userId);

async function loadRoom(roomId) {
  if (!isValidId(String(roomId))) throw ApiError.notFound('Room not found.');
  const room = await FocusRoom.findById(roomId).lean();
  if (!room) throw ApiError.notFound('Room not found.');
  return room;
}

async function serializeRooms(rooms) {
  const ids = new Set();
  for (const r of rooms) { ids.add(idStr(r.hostId)); for (const p of activeParticipants(r)) ids.add(idStr(p.user)); }
  const users = await User.find({ _id: { $in: [...ids] } }).lean();
  const byId = new Map(users.map((u) => [idStr(u._id), u]));
  return rooms.map((r) => ({
    id: idStr(r._id), title: r.title, hostId: idStr(r.hostId), durationSec: r.durationSec, status: r.status,
    startedAt: r.startedAt ?? null, endsAt: r.endsAt ?? null,
    participants: activeParticipants(r).filter((p) => byId.has(idStr(p.user))).map((p) => ({ user: toUser(byId.get(idStr(p.user))), joinedAt: p.joinedAt })),
    invitedIds: (r.invited || []).map(idStr),
  }));
}
export const serializeRoom = async (room) => (await serializeRooms([room]))[0];

export const toRoomMessage = (m) => ({ id: idStr(m._id), roomId: idStr(m.roomId), senderId: m.senderId ? idStr(m.senderId) : null, kind: m.kind, text: m.text ?? '', createdAt: m.createdAt });

/** Who a broadcast about this room goes to. */
export const audienceOf = (room) => ({ participantIds: activeParticipants(room).map((p) => idStr(p.user)), invitedIds: (room.invited || []).map(idStr) });

async function systemLine(roomId, kind, senderId = null) {
  return toRoomMessage(await RoomMessage.create({ roomId, senderId, kind, text: '' }));
}

// ---------------------------------------------------------------------------------------------------------------------
// HTTP reads
// ---------------------------------------------------------------------------------------------------------------------

/** scope=mine: open rooms I host or am in. scope=joinable: open rooms I was invited to and have not joined. */
export async function listRooms(userId, scope) {
  if (!['mine', 'joinable'].includes(scope)) throw ApiError.validation('scope must be "mine" or "joinable".', { scope: 'Invalid.' });
  const me = toObjectId(userId);
  const filter = scope === 'mine'
    ? { status: { $in: OPEN }, $or: [{ hostId: me }, { participants: { $elemMatch: { user: me, leftAt: null } } }] }
    : { status: { $in: OPEN }, invited: me, hostId: { $ne: me }, participants: { $not: { $elemMatch: { user: me, leftAt: null } } } };
  const rooms = await FocusRoom.find(filter).sort({ createdAt: -1 }).limit(50).lean();
  return serializeRooms(rooms);
}

export async function getRoom(userId, roomId) {
  const room = await loadRoom(roomId);
  if (!canAccess(room, userId)) throw ApiError.forbidden('You do not have access to this room.');
  return serializeRoom(room);
}

/** Newest first. Readable by the host and anyone who has joined; an invitation alone does not reveal the chat. */
export async function listRoomMessages(userId, roomId, { before, limit = 30 } = {}) {
  const room = await loadRoom(roomId);
  if (!isHost(room, userId) && !everJoined(room, userId)) throw ApiError.forbidden('Join the room to read its chat.');
  if (before && !isValidId(before)) throw ApiError.validation('Invalid cursor.', { before: 'Invalid cursor.' });
  const filter = { roomId: room._id, ...(before ? { _id: { $lt: before } } : {}) };
  const rows = await RoomMessage.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { items: page.map(toRoomMessage), hasMore, nextCursor: hasMore ? idStr(page[page.length - 1]._id) : null };
}

// ---------------------------------------------------------------------------------------------------------------------
// Writes (WS handlers). Each returns what the handler must broadcast.
// ---------------------------------------------------------------------------------------------------------------------

async function validateInvitees(hostId, userIds) {
  if (!Array.isArray(userIds)) throw ApiError.validation('Invalid invite list.', { inviteUserIds: 'Invalid.' });
  const ids = [...new Set(userIds.map(String))].filter((id) => id !== idStr(hostId));
  if (ids.some((id) => !isValidId(id))) throw ApiError.validation('Invalid user id.', { inviteUserIds: 'Invalid id.' });
  if (ids.length > LIMITS.ROOM_MAX_INVITES) throw ApiError.validation(`Invite at most ${LIMITS.ROOM_MAX_INVITES} people.`, { inviteUserIds: 'Too many.' });
  if (ids.length) {
    const friends = await friendsAmong(hostId, ids);
    if (ids.some((id) => !friends.has(id))) throw ApiError.forbidden('You can only invite friends.');
  }
  return ids;
}

/** ROOM_CREATE. The host is the first participant. @returns {{ room, newlyInvited: string[] }} */
export async function createRoom(hostId, { title, durationSec, inviteUserIds = [] } = {}) {
  const t = String(title ?? '').trim();
  if (!t || t.length > 60) throw ApiError.validation('Title must be 1 to 60 characters.', { title: 'Invalid length.' });
  if (!Number.isInteger(durationSec) || durationSec < 300 || durationSec > 14400) {
    throw ApiError.validation('Duration must be 5 minutes to 4 hours.', { durationSec: '300 to 14400 seconds.' });
  }
  const invited = await validateInvitees(hostId, inviteUserIds);
  const hosted = await FocusRoom.countDocuments({ hostId, status: { $in: OPEN } });
  if (hosted >= LIMITS.ROOM_MAX_OPEN_HOSTED) throw ApiError.conflict(`You can host at most ${LIMITS.ROOM_MAX_OPEN_HOSTED} open rooms.`);
  const room = await FocusRoom.create({ title: t, hostId, durationSec, invited, participants: [{ user: hostId, joinedAt: new Date() }] });
  return { room: await serializeRoom(room.toObject()), newlyInvited: invited, audience: audienceOf(room.toObject()) };
}

/** ROOM_INVITE (host only). @returns {{ room, newlyInvited }} newlyInvited are the ids that must receive ROOM_INVITED. */
export async function inviteUsers(hostId, roomId, userIds) {
  const room = await loadRoom(roomId);
  if (!isHost(room, hostId)) throw ApiError.forbidden('Only the host can invite people.');
  if (!OPEN.includes(room.status)) throw ApiError.conflict('This room has ended.');
  const ids = await validateInvitees(hostId, userIds);
  const fresh = ids.filter((id) => !isInvited(room, id));
  if (room.invited.length + fresh.length > LIMITS.ROOM_MAX_INVITES) throw ApiError.validation(`At most ${LIMITS.ROOM_MAX_INVITES} invitations per room.`, { userIds: 'Too many.' });
  const updated = fresh.length
    ? await FocusRoom.findOneAndUpdate({ _id: room._id, status: { $in: OPEN } }, { $addToSet: { invited: { $each: fresh.map(toObjectId) } } }, { new: true }).lean()
    : room;
  if (!updated) throw ApiError.conflict('This room has ended.');
  return { room: await serializeRoom(updated), newlyInvited: fresh, audience: audienceOf(updated) };
}

/**
 * ROOM_JOIN: host, invited users and current participants only; open rooms only; idempotent.
 * @returns {{ room, messages (last 50, newest first), serverNow, joined: boolean, systemMessage|null, audience }}
 */
export async function joinRoom(userId, roomId) {
  let room = await loadRoom(roomId);
  if (!canAccess(room, userId)) throw ApiError.forbidden('You do not have access to this room.');
  if (!OPEN.includes(room.status)) throw ApiError.conflict('This room has ended.');
  let joined = false;
  if (!isActive(room, userId)) {
    if (activeParticipants(room).length >= LIMITS.ROOM_MAX_PARTICIPANTS) throw ApiError.conflict('This room is full.'); // soft cap: a race can overshoot by a few
    const me = toObjectId(userId);
    const now = new Date();
    // Re-join: flip leftAt back; otherwise first join: push (guarded so concurrent calls cannot add a duplicate).
    let upd = await FocusRoom.findOneAndUpdate(
      { _id: room._id, status: { $in: OPEN }, participants: { $elemMatch: { user: me, leftAt: { $ne: null } } } },
      { $set: { 'participants.$[p].leftAt': null, 'participants.$[p].joinedAt': now } },
      { arrayFilters: [{ 'p.user': me }], new: true },
    ).lean();
    if (!upd) {
      upd = await FocusRoom.findOneAndUpdate(
        { _id: room._id, status: { $in: OPEN }, 'participants.user': { $ne: me } },
        { $push: { participants: { user: me, joinedAt: now, leftAt: null } } },
        { new: true },
      ).lean();
    }
    if (upd) { room = upd; joined = true; } else room = await loadRoom(roomId); // lost a race (already joined) or the room just ended
    if (!OPEN.includes(room.status)) throw ApiError.conflict('This room has ended.');
  }
  const systemMessage = joined ? await systemLine(room._id, 'join', userId) : null;
  const messages = (await RoomMessage.find({ roomId: room._id }).sort({ _id: -1 }).limit(50).lean()).map(toRoomMessage);
  return { room: await serializeRoom(room), messages, serverNow: new Date(), joined, systemMessage, audience: audienceOf(room) };
}

/** ROOM_LEAVE. Idempotent. If the host leaves a room that has not started, the room is cancelled. */
export async function leaveRoom(userId, roomId) {
  const room = await loadRoom(roomId);
  if (!canAccess(room, userId)) throw ApiError.forbidden('You do not have access to this room.');
  const me = toObjectId(userId);
  let cur = room;
  let left = false;
  if (isActive(room, userId)) {
    const upd = await FocusRoom.findOneAndUpdate(
      { _id: room._id, participants: { $elemMatch: { user: me, leftAt: null } } },
      { $set: { 'participants.$[p].leftAt': new Date() } },
      { arrayFilters: [{ 'p.user': me, 'p.leftAt': null }], new: true },
    ).lean();
    if (upd) { cur = upd; left = true; }
  }
  let cancelled = false;
  if (left && isHost(cur, userId) && cur.status === 'lobby') {
    const c = await FocusRoom.findOneAndUpdate({ _id: cur._id, status: 'lobby' }, { $set: { status: 'cancelled' } }, { new: true }).lean();
    if (c) { cur = c; cancelled = true; }
  }
  const systemMessage = left && !cancelled ? await systemLine(room._id, 'leave', userId) : null;
  // `audience` is computed from the room BEFORE the leave so the leaver (and, on cancel, everyone) still gets the final state.
  return { room: await serializeRoom(cur), left, cancelled, systemMessage, audience: audienceOf(room) };
}

/** ROOM_START (host only, lobby -> running). The server sets endsAt = now + durationSec. */
export async function startRoom(hostId, roomId) {
  const room = await loadRoom(roomId);
  if (!isHost(room, hostId)) throw ApiError.forbidden('Only the host can start the room.');
  const now = new Date();
  const upd = await FocusRoom.findOneAndUpdate(
    { _id: room._id, hostId, status: 'lobby' },
    { $set: { status: 'running', startedAt: now, endsAt: new Date(now.getTime() + room.durationSec * 1000) } },
    { new: true },
  ).lean();
  if (!upd) throw ApiError.conflict('This room has already started or ended.');
  return { room: await serializeRoom(upd), serverNow: now, systemMessage: await systemLine(room._id, 'start', hostId), audience: audienceOf(upd) };
}

/** ROOM_CANCEL (host only). Idempotent for an already-cancelled room; a completed room cannot be cancelled. */
export async function cancelRoom(hostId, roomId) {
  const room = await loadRoom(roomId);
  if (!isHost(room, hostId)) throw ApiError.forbidden('Only the host can cancel the room.');
  if (room.status === 'completed') throw ApiError.conflict('This room has already finished.');
  if (room.status === 'cancelled') return { room: await serializeRoom(room), changed: false, audience: audienceOf(room) };
  const upd = await FocusRoom.findOneAndUpdate({ _id: room._id, status: { $in: OPEN } }, { $set: { status: 'cancelled' } }, { new: true }).lean();
  if (!upd) throw ApiError.conflict('This room has already finished.');
  return { room: await serializeRoom(upd), changed: true, audience: audienceOf(upd) };
}

/** ROOM_MESSAGE: active participants of an open room, 1 to 500 characters. */
export async function sendRoomMessage(userId, roomId, text) {
  const room = await loadRoom(roomId);
  if (!isActive(room, userId)) throw ApiError.forbidden('Join the room to chat.');
  if (!OPEN.includes(room.status)) throw ApiError.conflict('This room has ended.');
  const body = String(text ?? '').trim();
  if (!body || body.length > LIMITS.ROOM_MESSAGE_MAX) throw ApiError.validation(`Messages must be 1 to ${LIMITS.ROOM_MESSAGE_MAX} characters.`, { text: 'Invalid length.' });
  const message = toRoomMessage(await RoomMessage.create({ roomId: room._id, senderId: userId, kind: 'text', text: body }));
  return { message, audience: audienceOf(room) };
}

/** Timer path (Chat 04 / jobs): atomically completes a running room whose endsAt has passed. Returns null if not due or already done. */
export async function completeRoomIfDue(roomId, now = new Date()) {
  if (!isValidId(String(roomId))) return null;
  const upd = await FocusRoom.findOneAndUpdate(
    { _id: roomId, status: 'running', endsAt: { $lte: now } },
    { $set: { status: 'completed', completedAt: now } },
    { new: true },
  ).lean();
  if (!upd) return null;
  return { room: await serializeRoom(upd), completedAt: upd.completedAt, durationSec: upd.durationSec, systemMessage: await systemLine(upd._id, 'complete'), audience: audienceOf(upd) };
}

export async function completeDueRooms(now = new Date()) {
  const due = await FocusRoom.find({ status: 'running', endsAt: { $lte: now } }).select('_id').lean();
  const out = [];
  for (const d of due) { const r = await completeRoomIfDue(d._id, now); if (r) out.push(r); }
  return out;
}

/** For re-arming timers after a restart (WEBSOCKET_PROTOCOL 9): [{ id, endsAt }] of every running room. */
export async function listRunningRooms() {
  return (await FocusRoom.find({ status: 'running' }).select('endsAt').lean()).map((r) => ({ id: idStr(r._id), endsAt: r.endsAt }));
}
