import mongoose from 'mongoose';

export const isValidId = (v) => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);
export const toObjectId = (v) => new mongoose.Types.ObjectId(String(v));

/** Normalized pair for Friendship: [userA (smaller), userB (larger)], compared as hex strings. DATABASE_SCHEMA 3.3. */
export function pairKey(idX, idY) {
  const x = String(idX);
  const y = String(idY);
  return x < y ? [x, y] : [y, x];
}

/** Direct conversation key "idA:idB" (sorted). DATABASE_SCHEMA 3.4. */
export function directKey(idX, idY) {
  return pairKey(idX, idY).join(':');
}
