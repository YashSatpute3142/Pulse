// Chat 05 (Database Architect), DATABASE_SCHEMA v1.1 section 3.10. Canvas has no consumers yet (Phase 6), so this is safe to change.
import mongoose from 'mongoose';
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

export const CANVAS_MAX_STROKES = 2000; // per session, enforced atomically by the seq counter (see canvas service contract in the schema doc)

const canvasSessionSchema = new Schema({
  ownerType: { type: String, enum: ['conversation', 'room'], required: true },
  ownerId:   { type: ObjectId, required: true },
  seq:       { type: Number, default: 0, min: 0, max: CANVAS_MAX_STROKES }, // strokes persisted since the last clear; next stroke gets seq+1
  epoch:     { type: Number, default: 0, min: 0 },                          // +1 on every clear; rejects a stroke that finishes after a clear
  clearedAt: { type: Date, default: null },
}, { timestamps: true });

canvasSessionSchema.index({ ownerType: 1, ownerId: 1 }, { unique: true });

export const CanvasSession = mongoose.models.CanvasSession || mongoose.model('CanvasSession', canvasSessionSchema);
