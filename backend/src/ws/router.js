import { C2S, WS_ERROR, WS_LIMITS, WS_CLOSE } from '../constants/eventTypes.js';
import { ApiError } from '../utils/ApiError.js';
import { parseFrame, FrameError, ackFrame, errorFrame } from './envelope.js';

const CODE_MAP = { TOKEN_REUSED: WS_ERROR.UNAUTHENTICATED, UNSUPPORTED_MEDIA: WS_ERROR.VALIDATION_ERROR };
// Protocol Section 2: these never get an ACK or ERROR, so an event of this kind that is not implemented yet is dropped silently.
const NO_REPLY = new Set([C2S.PING, C2S.TYPING_START, C2S.TYPING_STOP, C2S.CANVAS_UPDATE]);
const KNOWN = new Set(Object.values(WS_ERROR));
export const toWsCode = (code) => CODE_MAP[code] || (KNOWN.has(code) ? code : WS_ERROR.INTERNAL);

/**
 * Pipeline (protocol Section 3): parse -> size -> envelope -> rate limit -> type lookup -> zod -> service call -> ACK -> broadcast.
 * A handler is { type, schema, ack = true, run(ctx, payload, env) } and returns data for the ACK, or { data, after } where `after`
 * runs once the ACK is written (broadcasts). Handlers hold no business logic and never touch the database.
 */
export function createRouter({ handlers, broadcast, logger, onActivity }) {
  const registry = new Map();
  const register = (list) => { for (const h of list) registry.set(h.type, { ack: true, ...h }); };
  register(handlers);

  const sendError = (socket, replyTo, code, message) => broadcast.raw(socket, errorFrame(replyTo, code, message));

  async function process(socket, ctx, raw, isBinary) {
    let env;
    const { limiter } = socket.meta;
    try {
      env = parseFrame(raw, isBinary, WS_LIMITS.MAX_FRAME_BYTES);
    } catch (err) {
      if (!(err instanceof FrameError)) throw err;
      const r = limiter.take('__invalid');
      if (!r.ok && r.abusive) { socket.close(WS_CLOSE.POLICY, 'rate limit abuse'); return; }
      sendError(socket, err.replyTo, err.code, err.message);
      return;
    }
    socket.meta.alive = true;

    const rate = limiter.take(env.type);
    if (!rate.ok) {
      if (rate.abusive) { socket.close(WS_CLOSE.POLICY, 'rate limit abuse'); return; }
      if (registry.get(env.type)?.ack !== false) sendError(socket, env.id, WS_ERROR.RATE_LIMITED, 'Too many requests. Slow down.');
      return;
    }

    const def = registry.get(env.type);
    if (!def) {
      if (NO_REPLY.has(env.type)) return;
      sendError(socket, env.id, WS_ERROR.UNKNOWN_TYPE, `Unknown or unsupported event type: ${env.type}`);
      return;
    }

    // Any real user event means the user is active (presence returns to online); heartbeats and the explicit away report do not.
    if (env.type !== C2S.PING && env.type !== C2S.USER_STATUS) onActivity?.(socket);

    const parsed = def.schema.safeParse(env.payload);
    if (!parsed.success) {
      if (def.ack) sendError(socket, env.id, WS_ERROR.VALIDATION_ERROR, parsed.error.issues.map((i) => `${i.path.join('.') || 'payload'}: ${i.message}`).join('; ').slice(0, 300));
      return;
    }

    try {
      const result = await def.run(ctx, parsed.data, env);
      const { data, after } = result && typeof result === 'object' && 'after' in result ? result : { data: result, after: null };
      if (def.ack && socket.readyState === 1) broadcast.raw(socket, ackFrame(env.id, data ?? {}));
      if (after) after();
    } catch (err) {
      if (err instanceof ApiError) {
        if (def.ack) sendError(socket, env.id, toWsCode(err.code), err.message);
      } else {
        logger.error({ err, type: env.type, userId: socket.meta.userId }, 'ws handler failed');
        if (def.ack) sendError(socket, env.id, WS_ERROR.INTERNAL, 'Something went wrong.');
      }
    }
  }

  /** Events of one socket run strictly one after another (message order is preserved); the queue is bounded. */
  function dispatch(socket, ctx, raw, isBinary) {
    const m = socket.meta;
    if (m.queued >= WS_LIMITS.MAX_QUEUED_EVENTS) { sendError(socket, null, WS_ERROR.RATE_LIMITED, 'Too many pending requests.'); return; }
    m.queued += 1;
    m.chain = m.chain.then(() => process(socket, ctx, raw, isBinary)).catch((err) => logger.error({ err }, 'ws dispatch failed')).finally(() => { m.queued -= 1; });
  }

  return { dispatch, register, has: (t) => registry.has(t) };
}
