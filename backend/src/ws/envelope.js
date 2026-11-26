import { WS_VERSION, WS_ERROR } from '../constants/eventTypes.js';

/** Thrown by parseFrame; the router turns it into an ERROR frame. */
export class FrameError extends Error {
  constructor(code, message, replyTo = null) { super(message); this.code = code; this.replyTo = replyTo; }
}

/** UTF-8 JSON text only. Size is enforced by `ws` (maxPayload) and re-checked here. Returns { type, id, ts, payload }. */
export function parseFrame(raw, isBinary, maxBytes) {
  if (isBinary) throw new FrameError(WS_ERROR.INVALID_JSON, 'Binary frames are not supported.');
  const text = typeof raw === 'string' ? raw : raw.toString('utf8');
  if (Buffer.byteLength(text) > maxBytes) throw new FrameError(WS_ERROR.PAYLOAD_TOO_LARGE, 'Frame too large.');
  let env;
  try { env = JSON.parse(text); } catch { throw new FrameError(WS_ERROR.INVALID_JSON, 'Frame is not valid JSON.'); }
  if (!env || typeof env !== 'object' || Array.isArray(env)) throw new FrameError(WS_ERROR.INVALID_ENVELOPE, 'Envelope must be an object.');
  const replyTo = typeof env.id === 'string' && env.id.length <= 64 ? env.id : null;
  if (env.v !== WS_VERSION) throw new FrameError(WS_ERROR.INVALID_ENVELOPE, 'Unsupported protocol version.', replyTo);
  if (typeof env.type !== 'string' || !env.type || env.type.length > 40) throw new FrameError(WS_ERROR.INVALID_ENVELOPE, 'Missing type.', replyTo);
  if (replyTo === null || !replyTo) throw new FrameError(WS_ERROR.INVALID_ENVELOPE, 'Missing or invalid id.');
  const payload = env.payload === undefined ? {} : env.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new FrameError(WS_ERROR.INVALID_ENVELOPE, 'Payload must be an object.', replyTo);
  return { type: env.type, id: replyTo, ts: typeof env.ts === 'number' ? env.ts : null, payload };
}

export const frame = (type, payload = {}) => JSON.stringify({ v: WS_VERSION, type, ts: Date.now(), payload });
export const ackFrame = (replyTo, data = {}) => frame('ACK', { replyTo, ok: true, data });
export const errorFrame = (replyTo, code, message) => frame('ERROR', { replyTo: replyTo ?? null, code, message });
