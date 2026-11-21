import { User } from '../models/User.js';
import { Friendship } from '../models/Friendship.js';
import { ApiError } from '../utils/ApiError.js';
import { isValidId, pairKey } from '../utils/ids.js';
import { toFriend } from '../utils/serializers.js';
import { events, EVENTS } from '../utils/events.js';

const USER_FIELDS = 'username displayName avatarUrl bio createdAt disabledAt';

const other = (f, me) => (String(f.userA) === String(me) ? f.userB : f.userA);

async function usersById(ids) {
  const users = await User.find({ _id: { $in: ids }, disabledAt: null }).select(USER_FIELDS).lean();
  return new Map(users.map((u) => [String(u._id), u]));
}

async function requireTarget(actorId, targetId) {
  if (!isValidId(String(targetId))) throw ApiError.notFound('User not found.');
  if (String(targetId) === String(actorId)) throw ApiError.validation('You cannot do that to yourself.', { userId: 'Choose another user.' });
  const target = await User.findOne({ _id: targetId, disabledAt: null }).select(USER_FIELDS).lean();
  if (!target) throw ApiError.notFound('User not found.');
  return target;
}

function pushFriendUpdate(actorId, targetId, actorState, targetState) {
  events.emit(EVENTS.FRIEND_UPDATED, { recipientId: String(actorId), userId: String(targetId), friendship: actorState });
  events.emit(EVENTS.FRIEND_UPDATED, { recipientId: String(targetId), userId: String(actorId), friendship: targetState });
}

export async function listFriends(actorId) {
  const rows = await Friendship.find({ status: 'accepted', $or: [{ userA: actorId }, { userB: actorId }] }).sort({ respondedAt: -1, _id: -1 }).lean();
  const users = await usersById(rows.map((r) => other(r, actorId)));
  return rows.filter((r) => users.has(String(other(r, actorId))))
    .map((r) => toFriend(users.get(String(other(r, actorId))), r.respondedAt ?? r.createdAt, 'accepted'));
}

export async function listRequests(actorId) {
  const rows = await Friendship.find({ status: 'pending', $or: [{ userA: actorId }, { userB: actorId }] }).sort({ _id: -1 }).lean();
  const users = await usersById(rows.map((r) => other(r, actorId)));
  const incoming = [];
  const outgoing = [];
  for (const r of rows) {
    const u = users.get(String(other(r, actorId)));
    if (!u) continue;
    (String(r.requestedBy) === String(actorId) ? outgoing : incoming).push(toFriend(u, r.createdAt, 'pending'));
  }
  return { incoming, outgoing };
}

export async function sendRequest(actorId, targetId) {
  const target = await requireTarget(actorId, targetId);
  const [userA, userB] = pairKey(actorId, targetId);
  const existing = await Friendship.findOne({ userA, userB }).lean();
  if (existing) {
    if (existing.status === 'accepted') throw ApiError.conflict('You are already friends.');
    if (existing.status === 'pending') {
      throw ApiError.conflict(String(existing.requestedBy) === String(actorId) ? 'Friend request already sent.' : 'This user already sent you a request. Accept it instead.');
    }
    // blocked
    if (String(existing.blockedBy) === String(actorId)) throw ApiError.conflict('Unblock this user first.');
    throw ApiError.notFound('User not found.'); // they blocked the actor: hide existence
  }
  let doc;
  try {
    doc = await Friendship.create({ userA, userB, requestedBy: actorId, status: 'pending' });
  } catch (err) {
    if (err?.code === 11000) throw ApiError.conflict('Friend request already exists.');
    throw err;
  }
  pushFriendUpdate(actorId, targetId, 'pending_out', 'pending_in');
  return toFriend(target, doc.createdAt, 'pending');
}

export async function acceptRequest(actorId, fromUserId) {
  const target = await requireTarget(actorId, fromUserId);
  const [userA, userB] = pairKey(actorId, fromUserId);
  const doc = await Friendship.findOneAndUpdate(
    { userA, userB, status: 'pending', requestedBy: fromUserId },
    { $set: { status: 'accepted', respondedAt: new Date() } },
    { new: true },
  );
  if (!doc) throw ApiError.notFound('No pending request from this user.');
  pushFriendUpdate(actorId, fromUserId, 'friends', 'friends');
  return toFriend(target, doc.respondedAt, 'accepted');
}

/** Declines an incoming request, or cancels an outgoing one. */
export async function declineRequest(actorId, userId) {
  await requireTarget(actorId, userId);
  const [userA, userB] = pairKey(actorId, userId);
  const doc = await Friendship.findOneAndDelete({ userA, userB, status: 'pending' });
  if (!doc) throw ApiError.notFound('No pending request.');
  pushFriendUpdate(actorId, userId, 'none', 'none');
}

export async function removeFriend(actorId, userId) {
  await requireTarget(actorId, userId);
  const [userA, userB] = pairKey(actorId, userId);
  const doc = await Friendship.findOneAndDelete({ userA, userB, status: 'accepted' });
  if (!doc) throw ApiError.notFound('You are not friends with this user.');
  pushFriendUpdate(actorId, userId, 'none', 'none');
}

/**
 * Blocks (creating or overwriting any relationship). The schema stores ONE blocker per pair: if the other user already
 * blocked the actor, the existing block is kept (the actor's own block is not recorded; documented limitation).
 */
export async function blockUser(actorId, userId) {
  await requireTarget(actorId, userId);
  const [userA, userB] = pairKey(actorId, userId);
  const run = () => Friendship.findOneAndUpdate(
    { userA, userB, $or: [{ status: { $ne: 'blocked' } }, { blockedBy: actorId }] },
    { $set: { status: 'blocked', blockedBy: actorId, respondedAt: new Date() }, $setOnInsert: { requestedBy: actorId } },
    { upsert: true, new: true },
  );
  try {
    await run();
  } catch (err) {
    if (err?.code !== 11000) throw err;
    // Either the other user already holds the block (keep it) or two blocks raced; both end in a blocked pair.
  }
  pushFriendUpdate(actorId, userId, 'blocked', 'none');
}

export async function unblockUser(actorId, userId) {
  if (!isValidId(String(userId))) return;
  const [userA, userB] = pairKey(actorId, userId);
  const doc = await Friendship.findOneAndDelete({ userA, userB, status: 'blocked', blockedBy: actorId });
  if (doc) pushFriendUpdate(actorId, userId, 'none', 'none');
}
