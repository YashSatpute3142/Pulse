import { ApiError } from '../utils/ApiError.js';
import { zodFields } from './errorHandler.js';

/**
 * validate({ body, query, params }) with zod schemas. Parsed (coerced, trimmed) values replace the originals
 * on req.valid.{body,query,params}; handlers must read from req.valid, never raw input.
 */
export const validate = (schemas) => (req, _res, next) => {
  req.valid = {};
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const result = schemas[part].safeParse(part === 'body' ? (req.body ?? {}) : req[part]);
    if (!result.success) return next(ApiError.validation('Please check the highlighted fields.', zodFields(result.error)));
    req.valid[part] = result.data;
  }
  next();
};
