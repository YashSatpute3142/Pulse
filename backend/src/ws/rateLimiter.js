import { C2S } from '../constants/eventTypes.js';

// Protocol Section 4. { capacity events per windowMs }, refilled continuously. Typing is limited per conversation by its handler.
export const RATE_GROUPS = Object.freeze({
  default: { capacity: 30, windowMs: 10_000 },
  chat: { capacity: 10, windowMs: 10_000 },
  reaction: { capacity: 15, windowMs: 10_000 },
  typing: { capacity: 30, windowMs: 10_000 }, // outer abuse bound only; the protocol's 1 per 2 s per conversation rule lives in ws/typing.js
  canvas: { capacity: 20, windowMs: 1_000 },
});
export const GROUP_OF = Object.freeze({
  [C2S.CHAT_MESSAGE]: 'chat', [C2S.ROOM_MESSAGE]: 'chat',
  [C2S.MESSAGE_REACTION]: 'reaction',
  [C2S.TYPING_START]: 'typing', [C2S.TYPING_STOP]: 'typing',
  [C2S.CANVAS_UPDATE]: 'canvas',
});

const VIOLATION_WINDOW_MS = 60_000;
const VIOLATIONS_TO_CLOSE = 3;

/** One per socket. take(type) -> { ok, abusive }. `abusive` = 3 rejections within 60 s (caller closes with 1008). */
export function createRateLimiter({ now = Date.now, groups = RATE_GROUPS } = {}) {
  const buckets = new Map();
  let violations = [];
  return {
    take(type) {
      const name = GROUP_OF[type] || 'default';
      const g = groups[name];
      const t = now();
      let b = buckets.get(name);
      if (!b) { b = { tokens: g.capacity, at: t }; buckets.set(name, b); }
      b.tokens = Math.min(g.capacity, b.tokens + ((t - b.at) / g.windowMs) * g.capacity);
      b.at = t;
      if (b.tokens >= 1) { b.tokens -= 1; return { ok: true, abusive: false }; }
      violations = violations.filter((v) => t - v < VIOLATION_WINDOW_MS);
      violations.push(t);
      return { ok: false, abusive: violations.length >= VIOLATIONS_TO_CLOSE };
    },
  };
}
