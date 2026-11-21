import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { LIMITS } from '../constants/limits.js';
import { ALLOWED_MIMES } from '../utils/fileType.js';
import { getStorage } from './storage/index.js';
import { sniff } from '../utils/fileType.js';
import { isMember } from './access.service.js';
import { toAttachment } from '../utils/serializers.js';

const MAX_ATTACHMENTS = 5;
// Drop control characters and path separators from user-supplied names.
const cleanName = (n = '') => [...String(n)].filter((ch) => ch.charCodeAt(0) > 31 && ch.charCodeAt(0) !== 127 && ch !== '/' && ch !== '\\').join('').trim().slice(-200) || 'file';

/** POST /uploads: validates by magic bytes, stores through the adapter, returns the public Attachment shape. */
export async function createUpload(actorId, { buffer, originalname }, { conversationId } = {}) {
  const storage = getStorage();
  if (!storage) throw new ApiError('INTERNAL', 'Uploads are not configured on this server.');
  if (conversationId && !(await isMember(conversationId, actorId))) throw ApiError.notFound('Conversation not found.');

  const type = sniff(buffer, originalname);
  if (!type) throw new ApiError('UNSUPPORTED_MEDIA', 'This file type is not allowed.');

  const stored = await storage.upload({ buffer, kind: type.kind, ext: type.ext, userId: String(actorId), mime: type.mime, name: originalname });
  return toAttachment({ kind: type.kind, url: stored.url, name: cleanName(originalname), mime: type.mime, size: buffer.length, width: stored.width, height: stored.height });
}

function parseOwned(url, kind, actorId) {
  const cloud = env.CLOUDINARY_CLOUD_NAME;
  if (!cloud) return null;
  const resource = kind === 'image' ? 'image' : 'raw';
  const rx = new RegExp(`^https://res\\.cloudinary\\.com/${cloud.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/${resource}/upload/(?:v\\d+/)?(pulse/${actorId}/[A-Za-z0-9_-]{8,40}(?:\\.[a-z0-9]{1,5})?)$`);
  const m = rx.exec(url);
  if (!m) return null;
  return kind === 'image' ? m[1].replace(/\.[a-z0-9]{1,5}$/, '') : m[1]; // images: publicId has no extension
}

/**
 * CHAT_MESSAGE attachments (client-supplied descriptors) -> verified server-side records for storage in Message.attachments.
 * API_CONTRACT 4.6: the server re-verifies that each file belongs to the uploader. Ownership is proven by the storage path
 * `pulse/<actorId>/...` embedded in the URL; no client-supplied publicId is trusted.
 */
export function verifyAttachments(actorId, attachments = []) {
  if (!Array.isArray(attachments)) throw ApiError.validation('Invalid attachments.', { attachments: 'Invalid attachments.' });
  if (attachments.length > MAX_ATTACHMENTS) throw ApiError.validation(`Attach at most ${MAX_ATTACHMENTS} files.`, { attachments: `At most ${MAX_ATTACHMENTS}.` });
  return attachments.map((a) => {
    const ok = a && (a.kind === 'image' || a.kind === 'file') && typeof a.url === 'string' && ALLOWED_MIMES.has(a.mime)
      && Number.isFinite(a.size) && a.size > 0 && a.size <= LIMITS.ATTACHMENT_MAX_BYTES;
    const publicId = ok ? parseOwned(a.url, a.kind, String(actorId)) : null;
    if (!publicId) throw ApiError.forbidden('Attachment not allowed.');
    return {
      kind: a.kind, url: a.url, publicId, name: cleanName(a.name), mime: a.mime, size: a.size,
      ...(Number.isFinite(a.width) ? { width: a.width } : {}), ...(Number.isFinite(a.height) ? { height: a.height } : {}),
    };
  });
}

export async function destroyAttachments(attachments = []) {
  const storage = getStorage();
  if (!storage || !attachments.length) return;
  try { await storage.destroy(attachments.map((a) => ({ publicId: a.publicId, kind: a.kind }))); } catch { /* best effort */ }
}
