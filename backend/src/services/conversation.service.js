import { Conversation } from '../models/Conversation.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { isValidId, directKey, toObjectId } from '../utils/ids.js';
import { toConversation } from '../utils/serializers.js';
import { events, EVENTS } from '../utils/events.js';
import { LIMITS } from '../constants/limits.js';
import { activeMember, loadConversationForMember, myMembership, isAdminRole, areFriends, friendsAmong, getRelation } from './access.service.js';

const USER_FIELDS = 'username displayName avatarUrl bio createdAt';
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function usersMapFor(convs) {
  const ids = new Set();
  for (const c of convs) for (const m of c.members) if (!m.leftAt) ids.add(String(m.user));
  const users = await User.find({ _id: { $in: [...ids] }, disabledAt: null }).select(USER_FIELDS).lean();
  return new Map(users.map((u) => [String(u._id), u]));
}

async function serialize(convs, viewerId) {
  const users = await usersMapFor(convs);
  return convs.map((c) => toConversation(c, viewerId, users));
}

const activeIds = (conv) => conv.members.filter((m) => !m.leftAt).map((m) => String(m.user));
const emitUpdated = (conv) => events.emit(EVENTS.CONVERSATION_UPDATED, { conversationId: String(conv._id), memberIds: activeIds(conv) });

/** For WS handlers and events: the Conversation payload as `userId` sees it, or null if they are not an active member. */
export async function getConversationForUser(conversationId, userId) {
  if (!isValidId(String(conversationId))) return null;
  const conv = await Conversation.findOne({ _id: conversationId, members: activeMember(userId) }).lean();
  return conv ? (await serialize([conv], userId))[0] : null;
}

/** Ids of the conversations a user is an active member of (used by WS REGISTER to join conv:<id> rooms). */
export async function listConversationIds(userId) {
  const rows = await Conversation.find({ members: activeMember(userId) }).select('_id').lean();
  return rows.map((r) => String(r._id));
}

export async function list(actorId, { q = '', before, limit = 30 } = {}) {
  const me = toObjectId(actorId);
  const filter = { members: activeMember(me) };
  const and = [];

  if (before) {
    const cursor = isValidId(before) ? await Conversation.findOne({ _id: before, members: activeMember(me) }).select('updatedAt').lean() : null;
    if (!cursor) throw ApiError.validation('Invalid cursor.', { before: 'Invalid cursor.' });
    and.push({ $or: [{ updatedAt: { $lt: cursor.updatedAt } }, { updatedAt: cursor.updatedAt, _id: { $lt: cursor._id } }] });
  }

  const term = q.trim();
  if (term) {
    // DATABASE_SCHEMA 3.4: title prefix, or the other member's display name (user lookup first, then filter conversations).
    const rx = new RegExp(`^${escapeRegex(term.toLowerCase())}`);
    const people = await User.find({ _id: { $ne: me }, disabledAt: null, $or: [{ displayNameLower: rx }, { usernameLower: rx }] }).select('_id').limit(200).lean();
    and.push({
      $or: [
        { type: 'group', title: new RegExp(`^${escapeRegex(term)}`, 'i') },
        { type: 'direct', members: { $elemMatch: { user: { $in: people.map((p) => p._id) }, leftAt: null } } },
      ],
    });
  }
  if (and.length) filter.$and = and;

  const rows = await Conversation.find(filter).sort({ updatedAt: -1, _id: -1 }).limit(limit + 1).lean();
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { items: await serialize(page, actorId), hasMore, nextCursor: hasMore ? String(page[page.length - 1]._id) : null };
}

export async function get(actorId, conversationId) {
  const conv = await loadConversationForMember(conversationId, actorId);
  return (await serialize([conv.toObject()], actorId))[0];
}

export async function createDirect(actorId, userId) {
  if (String(userId) === String(actorId)) throw ApiError.validation('You cannot message yourself.', { userId: 'Choose another user.' });
  const target = await User.findOne({ _id: userId, disabledAt: null }).select('_id').lean();
  if (!target) throw ApiError.notFound('User not found.');
  const rel = await getRelation(actorId, userId);
  if (rel?.status === 'blocked') {
    if (String(rel.blockedBy) !== String(actorId)) throw ApiError.notFound('User not found.');
    throw ApiError.forbidden('Unblock this user to message them.');
  }

  const key = directKey(actorId, userId);
  const existing = await Conversation.findOne({ type: 'direct', directKey: key }).lean();
  if (existing) return { conversation: (await serialize([existing], actorId))[0], created: false };

  // Direct messages require an accepted friendship (owner decision, DATABASE_SCHEMA 5).
  if (!(await areFriends(actorId, userId))) throw ApiError.forbidden('You can only message friends.');

  let conv;
  try {
    conv = await Conversation.create({
      type: 'direct', directKey: key, createdBy: actorId,
      members: [{ user: actorId, role: 'member' }, { user: userId, role: 'member' }],
    });
  } catch (err) {
    if (err?.code === 11000) { // two simultaneous creates: the loser returns the winner's conversation
      const winner = await Conversation.findOne({ type: 'direct', directKey: key }).lean();
      if (winner) return { conversation: (await serialize([winner], actorId))[0], created: false };
    }
    throw err;
  }
  emitUpdated(conv);
  return { conversation: (await serialize([conv.toObject()], actorId))[0], created: true };
}

export async function createGroup(actorId, { title, memberIds }) {
  const others = [...new Set(memberIds.map(String))].filter((id) => id !== String(actorId));
  if (others.length < 2 || others.length > LIMITS.GROUP_MAX_MEMBERS - 1) {
    throw ApiError.validation(`A group needs 2 to ${LIMITS.GROUP_MAX_MEMBERS - 1} other members.`, { memberIds: `Choose 2 to ${LIMITS.GROUP_MAX_MEMBERS - 1} friends.` });
  }
  const found = await User.find({ _id: { $in: others }, disabledAt: null }).select('_id').lean();
  if (found.length !== others.length) throw ApiError.notFound('One or more users were not found.');
  const friends = await friendsAmong(actorId, others);
  const notFriends = others.filter((id) => !friends.has(id));
  if (notFriends.length) throw ApiError.forbidden('You can only add friends to a group.');

  const conv = await Conversation.create({
    type: 'group', title, createdBy: actorId,
    members: [{ user: actorId, role: 'owner' }, ...others.map((u) => ({ user: u, role: 'member' }))],
  });
  emitUpdated(conv);
  return (await serialize([conv.toObject()], actorId))[0];
}

function requireGroup(conv) {
  if (conv.type !== 'group') throw ApiError.validation('This is only available for group conversations.');
}
function requireAdmin(conv, actorId) {
  if (!isAdminRole(myMembership(conv, actorId))) throw ApiError.forbidden('Only group admins can do that.');
}

export async function updateGroup(actorId, conversationId, patch) {
  const conv = await loadConversationForMember(conversationId, actorId);
  requireGroup(conv);
  requireAdmin(conv, actorId);
  if (patch.title !== undefined) conv.title = patch.title;
  if (patch.avatarUrl !== undefined) conv.avatarUrl = patch.avatarUrl;
  await conv.save();
  emitUpdated(conv);
  return (await serialize([conv.toObject()], actorId))[0];
}

export async function addMembers(actorId, conversationId, userIds) {
  const conv = await loadConversationForMember(conversationId, actorId);
  requireGroup(conv);
  requireAdmin(conv, actorId);
  const wanted = [...new Set(userIds.map(String))];
  const found = await User.find({ _id: { $in: wanted }, disabledAt: null }).select('_id').lean();
  if (found.length !== wanted.length) throw ApiError.notFound('One or more users were not found.');
  const friends = await friendsAmong(actorId, wanted);
  if (wanted.some((id) => !friends.has(id))) throw ApiError.forbidden('You can only add friends to a group.');

  const activeNow = new Set(activeIds(conv));
  const toAdd = wanted.filter((id) => !activeNow.has(id));
  if (activeNow.size + toAdd.length > LIMITS.GROUP_MAX_MEMBERS) {
    throw ApiError.validation(`A group can have at most ${LIMITS.GROUP_MAX_MEMBERS} members.`, { userIds: 'Too many members.' });
  }
  for (const id of toAdd) {
    const previous = conv.members.find((m) => String(m.user) === id); // re-adding someone who left reuses their entry
    if (previous) Object.assign(previous, { leftAt: null, role: 'member', joinedAt: new Date(), unreadCount: 0, lastReadMessageId: null, lastReadAt: null });
    else conv.members.push({ user: id, role: 'member' });
  }
  if (toAdd.length) {
    await conv.save();
    emitUpdated(conv);
  }
  return (await serialize([conv.toObject()], actorId))[0];
}

/** Admin removes a member, or a member removes themselves (leave). Soft leave keeps history (schema 3.4 leftAt). */
export async function removeMember(actorId, conversationId, userId) {
  const conv = await loadConversationForMember(conversationId, actorId);
  requireGroup(conv);
  const self = String(userId) === String(actorId);
  const actor = myMembership(conv, actorId);
  const target = myMembership(conv, userId);
  if (!target) throw ApiError.notFound('Member not found.');

  if (!self) {
    if (!isAdminRole(actor)) throw ApiError.forbidden('Only group admins can remove members.');
    if (target.role === 'owner') throw ApiError.forbidden('The owner cannot be removed.');
    if (target.role === 'admin' && actor.role !== 'owner') throw ApiError.forbidden('Only the owner can remove an admin.');
  }

  target.leftAt = new Date();
  if (target.role === 'owner') { // ownership passes to the longest-standing admin, else the longest-standing member
    const rest = conv.members.filter((m) => !m.leftAt);
    const heir = rest.find((m) => m.role === 'admin') || rest[0];
    if (heir) heir.role = 'owner';
  }
  target.role = 'member';
  await conv.save();

  events.emit(EVENTS.CONVERSATION_REMOVED, { conversationId: String(conv._id), userId: String(userId) });
  if (activeIds(conv).length) emitUpdated(conv);
}

export async function setMute(actorId, conversationId, mutedUntil) {
  await loadConversationForMember(conversationId, actorId);
  await Conversation.updateOne(
    { _id: conversationId },
    { $set: { 'members.$[m].mutedUntil': mutedUntil } },
    { arrayFilters: [{ 'm.user': toObjectId(actorId), 'm.leftAt': null }], timestamps: false }, // muting must not reorder the inbox
  );
  events.emit(EVENTS.CONVERSATION_UPDATED, { conversationId: String(conversationId), memberIds: [String(actorId)] });
  return getConversationForUser(conversationId, actorId);
}
