import { env } from '../../config/env.js';
import { createCloudinaryStorage } from './cloudinaryStorage.js';

/**
 * File storage adapter interface (so tests can inject a fake and Cloudinary stays swappable):
 *   upload({ buffer, kind: 'image'|'file', ext, userId, mime, name }) -> { url, publicId, width?, height? }
 *   destroy([{ publicId, kind }]) -> void   (best effort)
 * publicIds are always namespaced `pulse/<userId>/<random>`; the owner check in attachment.service relies on that.
 */
let storage = null;

export function getStorage() {
  if (!storage) {
    if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) return null;
    storage = createCloudinaryStorage(env);
  }
  return storage;
}
export const setStorage = (s) => { storage = s; }; // tests only
