import { ERROR_CODES } from '../constants/errorCodes.js';

export class ApiError extends Error {
  constructor({ status = 0, code = ERROR_CODES.UNKNOWN, message = 'Something went wrong.', details = null, retryAfter = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfter = retryAfter;
  }
  get isNetwork() { return this.code === ERROR_CODES.NETWORK; }
  /** Field errors from VALIDATION_ERROR: { fieldName: 'message' } (best effort). */
  get fieldErrors() {
    const f = this.details?.fields;
    if (!f) return {};
    if (Array.isArray(f)) {
      return f.reduce((acc, item) => {
        const key = item.field || item.path || item.name;
        if (key && !acc[key]) acc[key] = item.message || 'Invalid value';
        return acc;
      }, {});
    }
    if (typeof f === 'object') {
      return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Array.isArray(v) ? v[0] : String(v)]));
    }
    return {};
  }
}
