import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { ApiError } from '../utils/ApiError.js';
import { hashRefreshToken, randomToken, randomId, ttlToMs } from '../utils/crypto.js';

const ISSUER = 'pulse';
const AUDIENCE = 'pulse-api';

export function signAccessToken(user) {
  return jwt.sign({ tv: user.tokenVersion ?? 0 }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    subject: String(user._id),
    expiresIn: env.ACCESS_TOKEN_TTL,
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE });
  } catch (err) {
    throw ApiError.unauthenticated(err?.name === 'TokenExpiredError' ? 'Session expired.' : 'Invalid token.');
  }
}

/** Create a refresh token. New login = new family; rotation passes the existing familyId. */
export async function issueRefreshToken(userId, { familyId = randomId(), userAgent = '', ip = '' } = {}) {
  const token = randomToken();
  const doc = await RefreshToken.create({
    userId,
    tokenHash: hashRefreshToken(token),
    familyId,
    expiresAt: new Date(Date.now() + ttlToMs(env.REFRESH_TOKEN_TTL)),
    userAgent: String(userAgent).slice(0, 300),
    ip: String(ip).slice(0, 64),
  });
  return { token, doc };
}

/**
 * Rotate: atomically revoke the presented token and issue its successor in the same family.
 *  - unknown / expired token         -> UNAUTHENTICATED
 *  - already-revoked token presented -> reuse = theft signal: revoke the whole family -> TOKEN_REUSED
 * The atomic findOneAndUpdate guarantees that of two concurrent refreshes with the same token only one wins.
 */
export async function rotateRefreshToken(presented, meta = {}) {
  const tokenHash = hashRefreshToken(presented);
  const now = new Date();

  const old = await RefreshToken.findOneAndUpdate(
    { tokenHash, revokedAt: null, expiresAt: { $gt: now } },
    { $set: { revokedAt: now } },
    { new: false },
  );

  if (!old) {
    const existing = await RefreshToken.findOne({ tokenHash }).lean();
    if (existing && existing.revokedAt) {
      await revokeFamily(existing.userId, existing.familyId);
      throw ApiError.tokenReused();
    }
    throw ApiError.unauthenticated('Session expired.');
  }

  const { token, doc } = await issueRefreshToken(old.userId, { familyId: old.familyId, ...meta });
  await RefreshToken.updateOne({ _id: old._id }, { $set: { replacedBy: doc._id } });
  return { token, userId: old.userId, familyId: old.familyId };
}

export function revokeFamily(userId, familyId) {
  return RefreshToken.updateMany({ userId, familyId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

export function revokeAllForUser(userId, { exceptFamilyId } = {}) {
  const filter = { userId, revokedAt: null };
  if (exceptFamilyId) filter.familyId = { $ne: exceptFamilyId };
  return RefreshToken.updateMany(filter, { $set: { revokedAt: new Date() } });
}

/** Family of a presented token, without rotating (used by logout and password change). */
export async function findFamilyByToken(presented) {
  if (!presented) return null;
  const doc = await RefreshToken.findOne({ tokenHash: hashRefreshToken(presented) }).select('userId familyId').lean();
  return doc ? { userId: doc.userId, familyId: doc.familyId } : null;
}
