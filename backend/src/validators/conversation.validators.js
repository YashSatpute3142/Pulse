import { z } from 'zod';
import { objectId } from './common.js';
import { LIMITS } from '../constants/limits.js';

const httpsUrl = z.string().trim().max(500).url('Enter a valid URL.').refine((u) => u.startsWith('https://'), 'Use an https URL.');
const title = z.string().trim().min(1, 'Enter a group name.').max(60, 'Use at most 60 characters.');

export const listQuery = z.object({
  q: z.string().trim().max(60).default(''),
  before: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

export const createBody = z.discriminatedUnion('type', [
  z.object({ type: z.literal('direct'), userId: objectId }).strict(),
  z.object({
    type: z.literal('group'), title,
    memberIds: z.array(objectId).min(2, 'Choose at least 2 friends.').max(LIMITS.GROUP_MAX_MEMBERS - 1),
  }).strict(),
]);

export const updateBody = z.object({ title: title.optional(), avatarUrl: httpsUrl.nullable().optional() })
  .strict().refine((v) => Object.keys(v).length > 0, 'Nothing to update.');
export const addMembersBody = z.object({ userIds: z.array(objectId).min(1).max(LIMITS.GROUP_MAX_MEMBERS - 1) }).strict();
export const readBody = z.object({ messageId: objectId }).strict();
export const muteBody = z.object({ mutedUntil: z.iso.datetime().transform((s) => new Date(s)).nullable() }).strict();

export const convParam = z.object({ id: objectId });
export const memberParam = z.object({ id: objectId, userId: objectId });
export const messageParam = z.object({ id: objectId, messageId: objectId });
export const messagesQuery = z.object({ before: objectId.optional(), limit: z.coerce.number().int().min(1).max(50).default(30) });
