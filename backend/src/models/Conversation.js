// PROVISIONAL: implemented by Chat 03 (Backend) from docs/DATABASE_SCHEMA.md v1.0 because Chat 05 has not started.
// Pending review by Chat 05 (Database Architect). Do not change fields or indexes without a DATABASE_SCHEMA.md update (Chat 00).
import mongoose from 'mongoose';
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

// DATABASE_SCHEMA 3.4
const memberSchema = new Schema({
  user:              { type: ObjectId, ref: 'User', required: true },
  role:              { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
  joinedAt:          { type: Date, default: Date.now },
  lastReadMessageId: { type: ObjectId, default: null },
  lastReadAt:        { type: Date, default: null },
  unreadCount:       { type: Number, default: 0, min: 0 },
  mutedUntil:        { type: Date, default: null },
  leftAt:            { type: Date, default: null },
}, { _id: false });

const conversationSchema = new Schema({
  type:      { type: String, enum: ['direct', 'group'], required: true },
  directKey: { type: String, default: undefined },
  title:     { type: String, trim: true, maxlength: 60 },
  avatarUrl: { type: String, default: null },
  createdBy: { type: ObjectId, ref: 'User', required: true },
  members:   { type: [memberSchema], validate: [(v) => v.length >= 2 && v.length <= 50, 'members 2-50'] },
  lastMessage: {
    messageId: ObjectId,
    senderId:  ObjectId,
    preview:   String,
    type:      String,
    at:        Date,
  },
}, { timestamps: true });

conversationSchema.index({ 'members.user': 1, updatedAt: -1 });
conversationSchema.index({ directKey: 1 }, { unique: true, partialFilterExpression: { type: 'direct' } });

export const Conversation = mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);
