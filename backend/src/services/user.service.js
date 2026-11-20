import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Friendship } from '../models/Friendship.js';
import { ApiError } from '../utils/ApiError.js';
import { pairKey, toObjectId } from '../utils/ids.js';
import { toUser, toMe } from '../utils/serializers.js';
import { events, EVENTS } from '../utils/events.js';
import { LIMITS } from '../constants/limits.js';
import { revokeAllForUser, findFamilyByToken } from './token.service.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Ids of users who have blocked `userId`. */
async function blockersOf(userId) {
  const me = toObjectId(userId);
  const rows = await Friendship.find({ status: 'blocked', blockedBy: { $ne: me }, $or: [{ userA: me }, { userB: me }] })
    .select('blockedBy').lean();
  return rows.map((r) => r.blockedBy);
}

/** GET /users/search?q= : anchored escaped prefix on usernameLower / displayNameLower, max 20, excludes self and blockers. */
export async function search(actorId, q) {
  const term = q.trim().toLowerCase();
  if (!term) return [];
  const rx = new RegExp(`^${escapeRegex(term)}`);
  const blockers = await blockersOf(actorId);
  const users = await User.find({
    _id: { $nin: [toObjectId(actorId), ...blockers] },
    disabledAt: null,
    $or: [{ usernameLower: rx }, { displayNameLower: rx }],
  })
    .select('username displayName avatarUrl bio createdAt')
    .sort({ usernameLower: 1 })
    .limit(LIMITS.SEARCH_LIMIT)
    .lean();
  return users.map(toUser);
}

/** 'none' | 'pending_in' | 'pending_out' | 'friends' | 'blocked' from the actor's point of view. */
async function friendshipState(actorId, otherId) {
  const [a, b] = pairKey(actorId, otherId);
  const f = await Friendship.findOne({ userA: a, userB: b }).lean();
  if (!f) return 'none';
  if (f.status === 'accepted') return 'friends';
  if (f.status === 'blocked') return String(f.blockedBy) === String(actorId) ? 'blocked' : 'blockedBy';
  return String(f.requestedBy) === String(actorId) ? 'pending_out' : 'pending_in';
}

export async function getProfile(actorId, targetId) {
  const user = await User.findById(targetId).select('username displayName avatarUrl bio createdAt disabledAt').lean();
  if (!user || user.disabledAt) throw ApiError.notFound('User not found.');
  const friendship = String(targetId) === String(actorId) ? 'none' : await friendshipState(actorId, targetId);
  if (friendship === 'blockedBy') throw ApiError.notFound('User not found.'); // hide existence from blockers' targets
  return { ...toUser(user), friendship };
}

export async function updateProfile(actorId, { displayName, bio, avatarUrl }) {
  const user = await User.findById(actorId);
  if (!user || user.disabledAt) throw ApiError.unauthenticated();
  if (displayName !== undefined) user.displayName = displayName;
  if (bio !== undefined) user.bio = bio;
  if (avatarUrl !== undefined) user.avatarUrl = avatarUrl;
  await user.save(); // save() so the pre-validate hook refreshes displayNameLower
  return toMe(user);
}

export async function updateSettings(actorId, patch) {
  const $set = {};
  for (const [k, v] of Object.entries(patch)) $set[`settings.${k}`] = v;
  const user = await User.findOneAndUpdate({ _id: actorId, disabledAt: null }, { $set }, { new: true });
  if (!user) throw ApiError.unauthenticated();
  return toMe(user);
}

/**
 * Change password: verifies the current one, rotates the hash, bumps tokenVersion (all access tokens die) and
 * revokes every other session. The caller's own refresh family (from its cookie) survives, so it can silently refresh.
 */
export async function changePassword(actorId, { currentPassword, newPassword }, presentedRefreshToken) {
  const user = await User.findById(actorId).select('+passwordHash');
  if (!user || user.disabledAt) throw ApiError.unauthenticated();
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw ApiError.validation('Current password is incorrect.', { currentPassword: 'Current password is incorrect.' });
  }
  if (newPassword === currentPassword) {
    throw ApiError.validation('Choose a different password.', { newPassword: 'New password must differ from the current one.' });
  }
  user.passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_COST);
  user.tokenVersion += 1;
  await user.save();

  const fam = await findFamilyByToken(presentedRefreshToken);
  await revokeAllForUser(user._id, { exceptFamilyId: fam && String(fam.userId) === String(user._id) ? fam.familyId : undefined });
  events.emit(EVENTS.SESSION_REVOKED, { userId: String(user._id) });
}
