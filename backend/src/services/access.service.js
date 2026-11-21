import { Conversation } from '../models/Conversation.js';
import { Friendship } from '../models/Friendship.js';
import { ApiError } from '../utils/ApiError.js';
import { isValidId, pairKey } from '../utils/ids.js';

// DATABASE_SCHEMA Section 5: authorization queries shared by HTTP and WebSocket. Never trust client claims.

export const activeMember = (userId) => ({ $elemMatch: { user: userId, leftAt: null } });

export async function isMember(conversationId, userId) {
  if (!isValidId(String(conversationId))) return false;
  return !!(await Conversation.exists({ _id: conversationId, members: activeMember(userId) }));
}

/** Loads the conversation document for an active member, or throws 404 (existence is hidden from non-members). */
export async function loadConversationForMember(conversationId, userId) {
  if (!isValidId(String(conversationId))) throw ApiError.notFound('Conversation not found.');
  const conv = await Conversation.findOne({ _id: conversationId, members: activeMember(userId) });
  if (!conv) throw ApiError.notFound('Conversation not found.');
  return conv;
}

export const myMembership = (conv, userId) => conv.members.find((m) => String(m.user) === String(userId) && !m.leftAt);
export const isAdminRole = (m) => m && (m.role === 'owner' || m.role === 'admin');

export async function getRelation(userX, userY) {
  const [userA, userB] = pairKey(userX, userY);
  return Friendship.findOne({ userA, userB }).lean();
}

export async function areFriends(userX, userY) {
  const [userA, userB] = pairKey(userX, userY);
  return !!(await Friendship.exists({ userA, userB, status: 'accepted' }));
}

/** Friends among `candidateIds` of `userId` (one query). Returns a Set of id strings. */
export async function friendsAmong(userId, candidateIds) {
  const me = String(userId);
  const others = candidateIds.map(String);
  const rows = await Friendship.find({
    status: 'accepted',
    $or: [{ userA: me, userB: { $in: others } }, { userB: me, userA: { $in: others } }],
  }).select('userA userB').lean();
  return new Set(rows.map((r) => (String(r.userA) === me ? String(r.userB) : String(r.userA))));
}
