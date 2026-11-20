// PROVISIONAL: implemented by Chat 03 (Backend) from docs/DATABASE_SCHEMA.md v1.0 because Chat 05 has not started.
// Pending review by Chat 05 (Database Architect). Do not change fields or indexes without a DATABASE_SCHEMA.md update (Chat 00).
import mongoose from 'mongoose';
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

// DATABASE_SCHEMA 3.8
const roomMessageSchema = new Schema({
  roomId:   { type: ObjectId, ref: 'FocusRoom', required: true },
  senderId: { type: ObjectId, ref: 'User', default: null },
  kind:     { type: String, enum: ['text', 'join', 'leave', 'start', 'complete'], default: 'text' },
  text:     { type: String, default: '', maxlength: 500 },
}, { timestamps: true });

roomMessageSchema.index({ roomId: 1, _id: -1 });
roomMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

export const RoomMessage = mongoose.models.RoomMessage || mongoose.model('RoomMessage', roomMessageSchema);
