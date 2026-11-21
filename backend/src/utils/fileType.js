// Content sniffing by magic bytes (API_CONTRACT 4.6): the declared mime type and filename are never trusted.
// Allowed: images jpeg/png/webp/gif; files pdf, txt, docx, xlsx, pptx, zip. All <= 10 MB (enforced by multer).

const startsWith = (buf, bytes, offset = 0) => bytes.every((b, i) => buf[offset + i] === b);
const ascii = (buf, start, end) => buf.subarray(start, end).toString('latin1');

export const TYPES = Object.freeze({
  jpeg: { mime: 'image/jpeg', kind: 'image', exts: ['jpg', 'jpeg'] },
  png: { mime: 'image/png', kind: 'image', exts: ['png'] },
  gif: { mime: 'image/gif', kind: 'image', exts: ['gif'] },
  webp: { mime: 'image/webp', kind: 'image', exts: ['webp'] },
  pdf: { mime: 'application/pdf', kind: 'file', exts: ['pdf'] },
  txt: { mime: 'text/plain', kind: 'file', exts: ['txt'] },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'file', exts: ['docx'] },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', kind: 'file', exts: ['xlsx'] },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', kind: 'file', exts: ['pptx'] },
  zip: { mime: 'application/zip', kind: 'file', exts: ['zip'] },
});
export const ALLOWED_MIMES = new Set(Object.values(TYPES).map((t) => t.mime));

function isUtf8Text(buf) {
  if (buf.includes(0)) return false;
  try { new TextDecoder('utf-8', { fatal: true }).decode(buf); return true; } catch { return false; }
}

/** @returns {{ key: string, mime: string, kind: 'image'|'file', ext: string } | null} */
export function sniff(buf, filename = '') {
  if (!buf || buf.length < 4) return null;
  const ext = (filename.split('.').pop() || '').toLowerCase();
  let key = null;
  if (startsWith(buf, [0xff, 0xd8, 0xff])) key = 'jpeg';
  else if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) key = 'png';
  else if (ascii(buf, 0, 6) === 'GIF87a' || ascii(buf, 0, 6) === 'GIF89a') key = 'gif';
  else if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP') key = 'webp';
  else if (ascii(buf, 0, 5) === '%PDF-') key = 'pdf';
  else if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) { // ZIP container: docx/xlsx/pptx/zip. The extension picks among them.
    key = ['docx', 'xlsx', 'pptx'].includes(ext) ? ext : 'zip';
    if (key !== 'zip') {
      const marker = { docx: 'word/', xlsx: 'xl/', pptx: 'ppt/' }[key];
      if (!buf.includes(Buffer.from(marker))) key = 'zip'; // claims to be Office but has no such part: treat as a plain zip
    }
  } else if (isUtf8Text(buf)) key = 'txt';
  if (!key) return null;
  const t = TYPES[key];
  if (key === 'zip' && ext && ext !== 'zip') return null; // e.g. a .exe renamed .doc that happens to be zip: reject mismatches
  // Images are identified by content alone (pasted screenshots often have odd names); documents must also have the matching extension.
  if (t.kind === 'file' && !t.exts.includes(ext) && !(key === 'txt' && !ext)) return null;
  return { key, mime: t.mime, kind: t.kind, ext: t.exts[0] };
}
