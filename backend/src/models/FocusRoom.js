// PROVISIONAL: implemented by Chat 03 (Backend) from docs/DATABASE_SCHEMA.md v1.0 because Chat 05 has not started.
// Pending review by Chat 05 (Database Architect). Do not change fields or indexes without a DATABASE_SCHEMA.md update (Chat 00).
import mongoose from 'mongoose';
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

// DATABASE_SCHEMA 3.7
const focusRoomSchema = new Schema({
  title:       { type: String, required: true, trim: true, maxlength: 60 },
  hostId:      { type: ObjectId, ref: 'User', required: true },
  durationSec: { type: Number, required: true, min: 300, max: 14400 },
  status:      { type: String, enum: ['lobby', 'running', 'completed', 'cancelled'], default: 'lobby' },
  startedAt:   { type: Date, default: null },
  endsAt:      { type: Date, default: null },
  completedAt: { type: Date, default: null },
  invited:     [{ type: ObjectId, ref: 'User' }],
  participants: [{
    _id: false,
    user:     { type: ObjectId, ref: 'User', required: true },
    joinedAt: { type: Date, default: Date.now },
    leftAt:   { type: Date, default: null },
  }],
}, { timestamps: true });

focusRoomSchema.index({ status: 1, endsAt: 1 });
focusRoomSchema.index({ 'participants.user': 1, status: 1 });
focusRoomSchema.index({ invited: 1, status: 1 });
focusRoomSchema.index({ hostId: 1, status: 1, createdAt: -1 }); // v1.2: also serves the "open rooms hosted" count (deploy: npm run db:sync-indexes)

export const FocusRoom = mongoose.models.FocusRoom || mongoose.model('FocusRoom', focusRoomSchema);
