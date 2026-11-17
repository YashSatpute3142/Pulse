import { httpRequest } from './http.js';
import { tokenStore } from './tokenStore.js';
import { refreshSession } from './refresh.js';
import { ApiError } from './ApiError.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

/**
 * Authenticated request. On 401 UNAUTHENTICATED: refresh once, retry once.
 * If the refresh fails, the original 401 is surfaced and the session is cleared by refreshSession().
 * Pass { auth: false } for public endpoints (login, register, /time).
 */
export async function request(path, options = {}) {
  const { auth = true, ...rest } = options;
  if (!auth) return httpRequest(path, rest);

  try {
    return await httpRequest(path, { ...rest, token: tokenStore.get() });
  } catch (err) {
    const retryable = err instanceof ApiError && err.status === 401 && err.code === ERROR_CODES.UNAUTHENTICATED;
    if (!retryable) throw err;
    await refreshSession(); // throws if the session is gone
    return httpRequest(path, { ...rest, token: tokenStore.get() }); // retry exactly once
  }
}

export const api = {
  get: (path, opts) => request(path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
  patch: (path, body, opts) => request(path, { ...opts, method: 'PATCH', body }),
  put: (path, body, opts) => request(path, { ...opts, method: 'PUT', body }),
  delete: (path, opts) => request(path, { ...opts, method: 'DELETE' }),
};
