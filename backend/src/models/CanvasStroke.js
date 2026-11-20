// PROVISIONAL: implemented by Chat 03 (Backend) from docs/DATABASE_SCHEMA.md v1.0 because Chat 05 has not started.
// Pending review by Chat 05 (Database Architect). Do not change fields or indexes without a DATABASE_SCHEMA.md update (Chat 00).
import mongoose from 'mongoose';
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

// DATABASE_SCHEMA 3.10
const canvasStrokeSchema = new Schema({
  sessionId: { type: ObjectId, ref: 'CanvasSession', required: true },
  authorId:  { type: ObjectId, ref: 'User', required: true },
  seq:       { type: Number, required: true },
  tool:      { type: String, enum: ['pen', 'eraser', 'line', 'rect', 'ellipse'], default: 'pen' },
  color:     { type: String, match: /^#[0-9a-fA-F]{6}$/ },
  size:      { type: Number, min: 1, max: 32 },
  points:    { type: [Number], validate: [(v) => v.length <= 2000, 'too many points'] },
}, { timestamps: true });

canvasStrokeSchema.index({ sessionId: 1, seq: 1 });
canvasStrokeSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 14 });

export const CanvasStroke = mongoose.models.CanvasStroke || mongoose.model('CanvasStroke', canvasStrokeSchema);
