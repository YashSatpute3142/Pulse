// PROVISIONAL: implemented by Chat 03 (Backend) from docs/DATABASE_SCHEMA.md v1.0 because Chat 05 has not started.
// Pending review by Chat 05 (Database Architect). Do not change fields or indexes without a DATABASE_SCHEMA.md update (Chat 00).
import mongoose from 'mongoose';
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

// DATABASE_SCHEMA 3.9
const pollSchema = new Schema({
  conversationId: { type: ObjectId, ref: 'Conversation', required: true },
  messageId:      { type: ObjectId, ref: 'Message', default: null },
  creatorId:      { type: ObjectId, ref: 'User', required: true },
  question:       { type: String, required: true, trim: true, maxlength: 200 },
  options: {
    type: [{ _id: false, id: { type: String, required: true }, text: { type: String, maxlength: 80 } }],
    validate: [(v) => v.length >= 2 && v.length <= 8, '2-8 options'],
  },
  multiple:       { type: Boolean, default: false },
  anonymous:      { type: Boolean, default: false },
  votes: [{ _id: false, user: { type: ObjectId, ref: 'User' }, optionIds: [String], at: { type: Date, default: Date.now } }],
  closesAt:       { type: Date, default: null },
  closedAt:       { type: Date, default: null },
}, { timestamps: true });

pollSchema.index({ conversationId: 1, createdAt: -1 });

export const Poll = mongoose.models.Poll || mongoose.model('Poll', pollSchema);
