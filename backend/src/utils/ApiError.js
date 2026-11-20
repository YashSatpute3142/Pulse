import { ERROR_CODES, STATUS_BY_CODE } from '../constants/errorCodes.js';

export class ApiError extends Error {
  constructor(code, message, details, extra = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = STATUS_BY_CODE[code] ?? 500;
    this.details = details;
    this.headers = extra.headers; // e.g. Retry-After
  }

  static validation(message = 'Invalid input.', fields) {
    return new ApiError(ERROR_CODES.VALIDATION_ERROR, message, fields ? { fields } : undefined);
  }
  static unauthenticated(message = 'Authentication required.') {
    return new ApiError(ERROR_CODES.UNAUTHENTICATED, message);
  }
  static tokenReused(message = 'Session is no longer valid. Please sign in again.') {
    return new ApiError(ERROR_CODES.TOKEN_REUSED, message);
  }
  static forbidden(message = 'You are not allowed to do that.') {
    return new ApiError(ERROR_CODES.FORBIDDEN, message);
  }
  static notFound(message = 'Not found.') {
    return new ApiError(ERROR_CODES.NOT_FOUND, message);
  }
  static conflict(message = 'Already exists.', fields) {
    return new ApiError(ERROR_CODES.CONFLICT, message, fields ? { fields } : undefined);
  }
}
