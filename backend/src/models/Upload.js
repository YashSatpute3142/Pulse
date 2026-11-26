// Chat 05 (Database Architect), DATABASE_SCHEMA v1.2 section 3.11 (CONTRACT_DECISIONS A5). Written by POST /uploads, claimed by CHAT_MESSAGE.
// NOT yet used by any service: until Chat 03 wires it, ownership is still proven by the `pulse/<userId>/` storage path (see schema 3.11).
import mongoose from 'mongoose';
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

export const UPLOAD_UNUSED_TTL_SEC = 60 * 60 * 24;

const uploadSchema = new Schema({
  uploaderId: { type: ObjectId, ref: 'User', required: true },
  kind:       { type: String, enum: ['image', 'file'], required: true },
  url:        { type: String, required: true },
  publicId:   { type: String, required: true },          // storage id; never sent to clients
  usedAt:     { type: Date, default: null },             // set atomically when a message claims the file
  expiresAt:  { type: Date, default: () => new Date(Date.now() + UPLOAD_UNUSED_TTL_SEC * 1000) }, // $unset on claim; TTL only sees unused rows
}, { timestamps: { createdAt: true, updatedAt: false } });

uploadSchema.index({ url: 1 }, { unique: true });
uploadSchema.index({ uploaderId: 1, createdAt: -1 });
uploadSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Upload = mongoose.models.Upload || mongoose.model('Upload', uploadSchema);
