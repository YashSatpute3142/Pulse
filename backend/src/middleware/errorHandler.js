import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { logger } from '../utils/logger.js';

/** zod issues -> { fieldName: 'first message' } for details.fields */
export function zodFields(error) {
  const fields = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

// Single error format (API_CONTRACT 1/2). Never leaks internals on 500.
export function errorHandler(err, req, res, _next) {
  let apiErr;
  if (err instanceof ApiError) apiErr = err;
  else if (err instanceof ZodError) apiErr = ApiError.validation('Please check the highlighted fields.', zodFields(err));
  else if (err?.type === 'entity.parse.failed') apiErr = ApiError.validation('Request body is not valid JSON.');
  else if (err?.type === 'entity.too.large') apiErr = new ApiError(ERROR_CODES.PAYLOAD_TOO_LARGE, 'Request body is too large.');
  else if (err?.code === 11000) apiErr = ApiError.conflict('That value is already in use.', err.keyPattern ? Object.fromEntries(Object.keys(err.keyPattern).map((k) => [k, 'Already in use.'])) : undefined);
  else apiErr = new ApiError(ERROR_CODES.INTERNAL, 'Something went wrong on our side.');

  if (apiErr.status >= 500) logger.error({ err, reqId: req.id }, 'unhandled error');
  if (apiErr.headers) for (const [k, v] of Object.entries(apiErr.headers)) res.setHeader(k, v);

  const error = { code: apiErr.code, message: apiErr.message };
  if (apiErr.details) error.details = apiErr.details;
  res.status(apiErr.status).json({ error });
}
