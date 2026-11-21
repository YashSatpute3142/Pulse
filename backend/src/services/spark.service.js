import { SPARKS, SPARK_KINDS } from '../constants/sparks.js';
import { ApiError } from '../utils/ApiError.js';

/** GET /sparks/random?kind=question|challenge -> { id, kind, text }. `exclude` lets callers avoid repeating the previous one. */
export function randomSpark(kind = 'question', exclude) {
  if (!SPARK_KINDS.includes(kind)) throw ApiError.validation('kind must be "question" or "challenge".', { kind: 'Invalid.' });
  const pool = SPARKS.filter((s) => s.kind === kind);
  const choices = pool.length > 1 ? pool.filter((s) => s.id !== exclude) : pool;
  const s = choices[Math.floor(Math.random() * choices.length)];
  return { id: s.id, kind: s.kind, text: s.text };
}
