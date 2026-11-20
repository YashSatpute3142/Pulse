// PROVISIONAL: implemented by Chat 03 (Backend) from docs/DATABASE_SCHEMA.md v1.0 because Chat 05 has not started.
// Pending review by Chat 05 (Database Architect). Do not change fields or indexes without a DATABASE_SCHEMA.md update (Chat 00).
import mongoose from 'mongoose';
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

// DATABASE_SCHEMA 3.6
const activitySchema = new Schema({
  userId:     { type: ObjectId, ref: 'User', required: true },
  type:       { type: String, enum: ['studying', 'coding', 'gaming', 'music', 'working', 'break', 'available'], required: true },
  label:      { type: String, trim: true, maxlength: 60, default: '' },
  visibility: { type: String, enum: ['everyone', 'friends', 'nobody'], default: 'friends' },
  startedAt:  { type: Date, default: Date.now },
  expiresAt:  { type: Date, default: null },
}, { timestamps: true });

activitySchema.index({ userId: 1 }, { unique: true });
activitySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Activity = mongoose.models.Activity || mongoose.model('Activity', activitySchema);
