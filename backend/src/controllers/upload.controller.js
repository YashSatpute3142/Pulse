import { z } from 'zod';
import { createUpload } from '../services/attachment.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { objectId } from '../validators/common.js';

const fields = z.object({ conversationId: objectId.optional() });

export const upload = asyncHandler(async (req, res) => {
  const parsed = fields.safeParse({ conversationId: req.body?.conversationId || undefined });
  if (!parsed.success) throw ApiError.validation('Invalid conversationId.', { conversationId: 'Invalid id.' });
  const attachment = await createUpload(req.user.id, req.file, parsed.data);
  res.status(201).json({ data: attachment });
});
