import multer from 'multer';
import { LIMITS } from '../constants/limits.js';
import { ApiError } from '../utils/ApiError.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITS.ATTACHMENT_MAX_BYTES, files: 1, fields: 5, parts: 8 },
}).single('file');

/** Single multipart file in field "file" (API_CONTRACT 4.6). Size and shape errors map to the contract's error codes. */
export function uploadSingle(req, res, next) {
  parser(req, res, (err) => {
    if (!err) {
      if (!req.file) return next(ApiError.validation('Attach a file in the "file" field.', { file: 'Required.' }));
      return next();
    }
    if (err.code === 'LIMIT_FILE_SIZE') return next(new ApiError(ERROR_CODES.PAYLOAD_TOO_LARGE, 'Files can be at most 10 MB.'));
    if (err instanceof multer.MulterError) return next(ApiError.validation('Invalid upload.', { file: err.message }));
    // busboy throws plain Errors for broken multipart bodies (client fault, not ours).
    if (/^(Malformed|Unexpected end|Multipart|Missing|Boundary)/i.test(err.message || '')) return next(ApiError.validation('Malformed upload body.', { file: 'Malformed.' }));
    return next(err);
  });
}
