// Chat 05 (Database Architect), DATABASE_SCHEMA v1.2 section 3.10. Canvas has no consumers yet (Phase 6), so this is safe to change.
import mongoose from 'mongoose';
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const validPoints = (v) => Array.isArray(v) && v.length >= 2 && v.length <= 2000 && v.length % 2 === 0 && v.every((n) => Number.isFinite(n) && n >= 0 && n <= 1);

const canvasStrokeSchema = new Schema({
  sessionId: { type: ObjectId, ref: 'CanvasSession', required: true },
  authorId:  { type: ObjectId, ref: 'User', required: true },
  strokeId:  { type: String, required: true, match: /^[A-Za-z0-9_-]{8,64}$/ }, // client-generated; WS CANVAS_UPDATE already carries it; makes the `end` persist idempotent
  epoch:     { type: Number, required: true, min: 0 },   // CanvasSession.epoch at slot allocation (v1.2): a stroke that outlives a clear stays in the old epoch and is never replayed
  seq:       { type: Number, required: true, min: 1 },
  tool:      { type: String, enum: ['pen', 'eraser', 'line', 'rect', 'ellipse'], default: 'pen' },
  color:     { type: String, match: /^#[0-9a-fA-F]{6}$/ },
  size:      { type: Number, min: 1, max: 32 },
  points:    { type: [Number], validate: [validPoints, 'points must be an even-length flat [x,y,...] list of 1-1000 normalized (0-1) points'] },
}, { timestamps: true });

canvasStrokeSchema.index({ sessionId: 1, epoch: 1, seq: 1 }, { unique: true }); // replay order; a seq is unique within one epoch
canvasStrokeSchema.index({ sessionId: 1, strokeId: 1 }, { unique: true });    // a retried `end` cannot create a duplicate stroke
canvasStrokeSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 14 });

export const CanvasStroke = mongoose.models.CanvasStroke || mongoose.model('CanvasStroke', canvasStrokeSchema);
