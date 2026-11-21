import { Activity } from '../models/Activity.js';
import { User } from '../models/User.js';
import { Friendship } from '../models/Friendship.js';
import { ApiError } from '../utils/ApiError.js';
import { toUser } from '../utils/serializers.js';
import { events, EVENTS } from '../utils/events.js';
import { LIMITS } from '../constants/limits.js';
import { toObjectId } from '../utils/ids.js';
import { areFriends } from './access.service.js';
import { getPresence } from './presence.service.js';

export const ACTIVITY_TYPES = ['studying', 'coding', 'gaming', 'music', 'working', 'break', 'available'];
export const VISIBILITIES = ['everyone', 'friends', 'nobody'];

const live = () => ({ $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }); // the TTL job runs only every ~60 s

export const toActivity = (a) => ({
  userId: String(a.userId), type: a.type, label: a.label ?? '', visibility: a.visibility,
  startedAt: a.startedAt, updatedAt: a.updatedAt, expiresAt: a.expiresAt ?? null,
});

export async function getMine(userId) {
  const a = await Activity.findOne({ userId, ...live() }).lean();
  return a ? toActivity(a) : null;
}

/** PUT /activity/me and WS ACTIVITY_UPDATE. Visibility defaults to the user's setting. Replaces any current activity. */
export async function setActivity(userId, { type, label = '', visibility, expiresInMin } = {}) {
  if (!ACTIVITY_TYPES.includes(type)) throw ApiError.validation('Unknown activity type.', { type: 'Invalid.' });
  const clean = String(label ?? '').trim();
  if (clean.length > LIMITS.ACTIVITY_LABEL_MAX) throw ApiError.validation('Label is too long.', { label: `At most ${LIMITS.ACTIVITY_LABEL_MAX}.` });
  if (visibility !== undefined && !VISIBILITIES.includes(visibility)) throw ApiError.validation('Invalid visibility.', { visibility: 'Invalid.' });
  if (expiresInMin != null && !(Number.isInteger(expiresInMin) && expiresInMin >= 1 && expiresInMin <= LIMITS.ACTIVITY_MAX_EXPIRES_MIN)) {
    throw ApiError.validation('Invalid expiry.', { expiresInMin: `1 to ${LIMITS.ACTIVITY_MAX_EXPIRES_MIN} minutes.` });
  }
  let vis = visibility;
  if (!vis) {
    const u = await User.findById(userId).select('settings.activityVisibility').lean();
    vis = u?.settings?.activityVisibility ?? 'friends';
  }
  const now = new Date();
  const doc = await Activity.findOneAndUpdate(
    { userId },
    { $set: { type, label: clean, visibility: vis, startedAt: now, expiresAt: expiresInMin ? new Date(now.getTime() + expiresInMin * 60_000) : null } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  const activity = toActivity(doc);
  events.emit(EVENTS.ACTIVITY_CHANGED, { userId: String(userId), activity });
  return activity;
}

/** DELETE /activity/me and WS ACTIVITY_CLEAR. Idempotent. */
export async function clearActivity(userId) {
  const res = await Activity.deleteOne({ userId });
  if (res.deletedCount) events.emit(EVENTS.ACTIVITY_CHANGED, { userId: String(userId), activity: null });
}

/**
 * Who may see `ownerId`'s activity (used by WS to filter ACTIVITY_CHANGED per recipient): accepted friends, unless visibility is
 * 'nobody'. 'everyone' is also visible to non-friends who look the owner up, but is never BROADCAST beyond friends (unbounded audience).
 */
export async function activityAudience(ownerId, visibility = 'friends') {
  if (visibility === 'nobody') return [];
  const me = String(ownerId);
  const rows = await Friendship.find({ status: 'accepted', $or: [{ userA: me }, { userB: me }] }).select('userA userB').lean();
  return rows.map((r) => (String(r.userA) === me ? String(r.userB) : String(r.userA)));
}

/** Whether `viewerId` may see `ownerId`'s current activity row (owner always can). */
export async function canView(viewerId, ownerId, visibility) {
  if (String(viewerId) === String(ownerId)) return true;
  if (visibility === 'nobody') return false;
  if (visibility === 'everyone') return true;
  return areFriends(viewerId, ownerId);
}

/** GET /activity/feed: friends' current activities (visibility friends|everyone), newest first, with presence. */
export async function feed(viewerId) {
  const friendIds = await activityAudience(viewerId, 'friends');
  if (!friendIds.length) return [];
  const [acts, users] = await Promise.all([
    Activity.find({ userId: { $in: friendIds.map(toObjectId) }, visibility: { $in: ['friends', 'everyone'] }, ...live() }).sort({ updatedAt: -1 }).lean(),
    User.find({ _id: { $in: friendIds }, disabledAt: null }).lean(),
  ]);
  const byId = new Map(users.map((u) => [String(u._id), u]));
  const rows = acts.filter((a) => byId.has(String(a.userId)));
  const presence = await getPresence(rows.map((a) => a.userId));
  return rows.map((a) => ({ user: toUser(byId.get(String(a.userId))), activity: toActivity(a), presence: presence.get(String(a.userId)) ?? 'offline' }));
}
