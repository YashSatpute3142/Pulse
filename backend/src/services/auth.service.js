import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { toMe } from '../utils/serializers.js';
import { events, EVENTS } from '../utils/events.js';
import {
  signAccessToken, issueRefreshToken, rotateRefreshToken, revokeFamily, findFamilyByToken, revokeAllForUser,
} from './token.service.js';
import { issueTicket } from './ticket.service.js';

// Compared against when the account does not exist, so response time does not reveal which identifiers are registered.
const DUMMY_HASH = bcrypt.hashSync('pulse-timing-equalizer', env.BCRYPT_COST);
const BAD_CREDENTIALS = 'Incorrect email, username or password.';

async function session(user, refreshToken) {
  return { user: toMe(user), accessToken: signAccessToken(user), refreshToken };
}

export async function register({ username, email, password, displayName }, meta) {
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_COST);

  // Friendly field-level conflicts first; the unique indexes remain the real guard against races (caught below).
  const [byName, byEmail] = await Promise.all([
    User.exists({ usernameLower: username.toLowerCase() }),
    User.exists({ email }),
  ]);
  if (byName || byEmail) {
    const fields = {};
    if (byName) fields.username = 'That username is taken.';
    if (byEmail) fields.email = 'That email is already registered.';
    throw ApiError.conflict('That username or email is already taken.', fields);
  }

  let user;
  try {
    user = await User.create({ username, email, passwordHash, displayName });
  } catch (err) {
    if (err?.code === 11000) {
      const key = Object.keys(err.keyPattern || {})[0];
      const fields = key === 'email' ? { email: 'That email is already registered.' } : { username: 'That username is taken.' };
      throw ApiError.conflict('That username or email is already taken.', fields);
    }
    throw err;
  }
  const { token } = await issueRefreshToken(user._id, meta);
  return session(user, token);
}

export async function login({ identifier, password }, meta) {
  const id = identifier.toLowerCase();
  const user = await User.findOne({ $or: [{ email: id }, { usernameLower: id }] }).select('+passwordHash');
  const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok || user.disabledAt) throw ApiError.unauthenticated(BAD_CREDENTIALS);

  const { token } = await issueRefreshToken(user._id, meta);
  return session(user, token);
}

export async function refresh(presentedToken, meta) {
  if (!presentedToken) throw ApiError.unauthenticated('No session.');
  const { token, userId } = await rotateRefreshToken(presentedToken, meta);
  const user = await User.findById(userId);
  if (!user || user.disabledAt) {
    await revokeAllForUser(userId);
    throw ApiError.unauthenticated('Session expired.');
  }
  return session(user, token);
}

/** Cookie-only. Idempotent: always succeeds, revoking the token's family when it is known. */
export async function logout(presentedToken) {
  const fam = await findFamilyByToken(presentedToken);
  if (!fam) return;
  await revokeFamily(fam.userId, fam.familyId);
  // ARCHITECTURE 3: logout bumps tokenVersion (invalidates outstanding access tokens) and closes the user's sockets.
  await User.updateOne({ _id: fam.userId }, { $inc: { tokenVersion: 1 } });
  events.emit(EVENTS.SESSION_REVOKED, { userId: String(fam.userId) });
}

export async function me(userId) {
  const user = await User.findById(userId);
  if (!user || user.disabledAt) throw ApiError.unauthenticated();
  return toMe(user);
}

export const wsTicket = (userId) => issueTicket(userId);
