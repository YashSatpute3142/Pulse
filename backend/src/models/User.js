// PROVISIONAL: implemented by Chat 03 (Backend) from docs/DATABASE_SCHEMA.md v1.0 because Chat 05 has not started.
// Pending review by Chat 05 (Database Architect). Do not change fields or indexes without a DATABASE_SCHEMA.md update (Chat 00).
import mongoose from 'mongoose';
const { Schema } = mongoose;

// DATABASE_SCHEMA 3.1
const userSchema = new Schema({
  username:      { type: String, required: true, trim: true, minlength: 3, maxlength: 24 },
  usernameLower: { type: String, required: true },
  email:         { type: String, required: true, trim: true, lowercase: true },
  passwordHash:  { type: String, required: true, select: false },
  displayName:   { type: String, required: true, trim: true, maxlength: 40 },
  displayNameLower: { type: String, required: true },
  avatarUrl:     { type: String, default: null },
  bio:           { type: String, default: '', maxlength: 160 },
  settings: {
    theme:              { type: String, enum: ['system', 'dark', 'light'], default: 'system' },
    activityVisibility: { type: String, enum: ['everyone', 'friends', 'nobody'], default: 'friends' },
    showPresence:       { type: Boolean, default: true },
    showReadReceipts:   { type: Boolean, default: true },
  },
  lastSeenAt:    { type: Date, default: null },
  tokenVersion:  { type: Number, default: 0 },
  disabledAt:    { type: Date, default: null },
}, { timestamps: true });

// "set in pre-validate" (schema 3.1): keep the lowercase search/unique fields in sync with the display fields.
userSchema.pre('validate', function setLowerFields(next) {
  if (this.username) this.usernameLower = this.username.toLowerCase();
  if (this.displayName) this.displayNameLower = this.displayName.toLowerCase();
  next();
});

userSchema.index({ usernameLower: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ displayNameLower: 1 });

// Schema principle 8: hide secrets in any accidental serialization.
userSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    delete ret.passwordHash;
    return ret;
  },
});

export const User = mongoose.models.User || mongoose.model('User', userSchema);
