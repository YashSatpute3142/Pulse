// PROVISIONAL: implemented by Chat 03 (Backend) from docs/DATABASE_SCHEMA.md v1.0 because Chat 05 has not started.
// Pending review by Chat 05 (Database Architect). Do not change fields or indexes without a DATABASE_SCHEMA.md update (Chat 00).
import mongoose from 'mongoose';
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

// DATABASE_SCHEMA 3.2
const refreshTokenSchema = new Schema({
  userId:     { type: ObjectId, ref: 'User', required: true },
  tokenHash:  { type: String, required: true },
  familyId:   { type: String, required: true },
  replacedBy: { type: ObjectId, ref: 'RefreshToken', default: null },
  revokedAt:  { type: Date, default: null },
  expiresAt:  { type: Date, required: true },
  userAgent:  { type: String, default: '' },
  ip:         { type: String, default: '' },
}, { timestamps: true });

refreshTokenSchema.index({ tokenHash: 1 }, { unique: true });
refreshTokenSchema.index({ userId: 1, familyId: 1 });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = mongoose.models.RefreshToken || mongoose.model('RefreshToken', refreshTokenSchema);
