// PROVISIONAL: implemented by Chat 03 (Backend) from docs/DATABASE_SCHEMA.md v1.0 because Chat 05 has not started.
// Pending review by Chat 05 (Database Architect). Do not change fields or indexes without a DATABASE_SCHEMA.md update (Chat 00).
import mongoose from 'mongoose';
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

// DATABASE_SCHEMA 3.5
const attachmentSchema = new Schema({
  kind:     { type: String, enum: ['image', 'file'], required: true },
  url:      { type: String, required: true },
  publicId: { type: String, required: true },
  name:     { type: String, maxlength: 200 },
  mime:     { type: String },
  size:     { type: Number },
  width: Number,
  height: Number,
}, { _id: false });

const messageSchema = new Schema({
  conversationId: { type: ObjectId, ref: 'Conversation', required: true },
  senderId:       { type: ObjectId, ref: 'User', default: null },
  type:           { type: String, enum: ['text', 'image', 'file', 'poll', 'system'], default: 'text' },
  text:           { type: String, default: '', maxlength: 4000 },
  attachments:    { type: [attachmentSchema], default: [], validate: [(v) => v.length <= 5, 'max 5'] },
  replyTo:        { type: ObjectId, ref: 'Message', default: null },
  pollId:         { type: ObjectId, ref: 'Poll', default: null },
  reactions: [{ _id: false, emoji: { type: String, maxlength: 16 }, users: [{ type: ObjectId, ref: 'User' }] }],
  clientId:       { type: String, default: undefined },
  editedAt:       { type: Date, default: null },
  deletedAt:      { type: Date, default: null },
}, { timestamps: true });

messageSchema.index({ conversationId: 1, _id: -1 });
messageSchema.index({ conversationId: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } });

export const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);
