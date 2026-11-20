// PROVISIONAL: implemented by Chat 03 (Backend) from docs/DATABASE_SCHEMA.md v1.0 because Chat 05 has not started.
// Pending review by Chat 05 (Database Architect). Do not change fields or indexes without a DATABASE_SCHEMA.md update (Chat 00).
import mongoose from 'mongoose';
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

// DATABASE_SCHEMA 3.10
const canvasSessionSchema = new Schema({
  ownerType: { type: String, enum: ['conversation', 'room'], required: true },
  ownerId:   { type: ObjectId, required: true },
  seq:       { type: Number, default: 0 },
  clearedAt: { type: Date, default: null },
}, { timestamps: true });

canvasSessionSchema.index({ ownerType: 1, ownerId: 1 }, { unique: true });

export const CanvasSession = mongoose.models.CanvasSession || mongoose.model('CanvasSession', canvasSessionSchema);
