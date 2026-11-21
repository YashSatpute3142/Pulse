import { z } from 'zod';
import { objectId } from './common.js';

export const sendRequestBody = z.object({ userId: objectId }).strict();
export const userIdParam = z.object({ userId: objectId });
