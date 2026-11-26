// PROVISIONAL: implemented by Chat 03 (Backend) from docs/DATABASE_SCHEMA.md v1.0 because Chat 05 has not started.
// Pending review by Chat 05 (Database Architect). Do not change fields or indexes without a DATABASE_SCHEMA.md update (Chat 00).
import mongoose from 'mongoose';
import { pairKey } from '../utils/ids.js';
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

// DATABASE_SCHEMA 3.3. Use pairKey() from utils/ids.js to fill userA/userB.
const friendshipSchema = new Schema({
  userA:       { type: ObjectId, ref: 'User', required: true },
  userB:       { type: ObjectId, ref: 'User', required: true },
  requestedBy: { type: ObjectId, ref: 'User', required: true },
  status:      { type: String, enum: ['pending', 'accepted', 'blocked'], default: 'pending' },
  blockedBy:   { type: ObjectId, ref: 'User', default: null },
  respondedAt: { type: Date, default: null },
}, { timestamps: true });

// v1.2: a pair has exactly one document only if userA < userB. Same comparison as pairKey(), so no caller can bypass it.
// (Hooks do not run for updateOne/findOneAndUpdate; those never change userA/userB.)
friendshipSchema.pre('validate', function enforceNormalizedPair(next) {
  if (this.userA && this.userB) {
    const [a, b] = pairKey(this.userA, this.userB);
    if (a === b || String(this.userA) !== a || String(this.userB) !== b) return next(new Error('Friendship requires userA < userB (use pairKey())'));
  }
  return next();
});

friendshipSchema.index({ userA: 1, userB: 1 }, { unique: true });
friendshipSchema.index({ userA: 1, status: 1 });
friendshipSchema.index({ userB: 1, status: 1 });

export const Friendship = mongoose.models.Friendship || mongoose.model('Friendship', friendshipSchema);
