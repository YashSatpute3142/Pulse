import { z } from 'zod';
import { objectId } from './common.js';
import { ACTIVITY_TYPES, VISIBILITIES } from '../services/activity.service.js';
import { SPARK_KINDS } from '../constants/sparks.js';

export const setActivityBody = z.object({
  type: z.enum(ACTIVITY_TYPES),
  label: z.string().trim().max(60).optional(),
  visibility: z.enum(VISIBILITIES).optional(),
  expiresInMin: z.number().int().min(1).max(24 * 60).optional(),
}).strict();

export const roomListQuery = z.object({ scope: z.enum(['joinable', 'mine']) });
export const roomMessagesQuery = z.object({
  before: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});
export const sparkQuery = z.object({ kind: z.enum(SPARK_KINDS).default('question'), exclude: z.string().max(10).optional() });
