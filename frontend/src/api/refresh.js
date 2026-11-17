import { httpRequest } from './http.js';
import { tokenStore } from './tokenStore.js';
import { sessionEvents } from './sessionEvents.js';
import { ApiError } from './ApiError.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

/**
 * POST /auth/refresh, safely.
 *
 * The backend rotates the refresh token on every use and treats reuse as theft (revokes the family).
 * So two refresh calls in flight with the same cookie would log the user out. Two guards:
 *  1. single-flight inside this tab (also covers React StrictMode's double effects),
 *  2. a Web Lock across tabs of the same browser, so tabs take turns and each sends the latest cookie.
 */
let inflight = null;

async function callRefresh() {
  const { data } = await httpRequest('/auth/refresh', { method: 'POST' });
  if (!data?.accessToken || !data?.user) {
    throw new ApiError({ status: 500, code: ERROR_CODES.UNKNOWN, message: 'Unexpected response from the server.' });
  }
  tokenStore.set(data.accessToken);
  return data; // { user, accessToken }
}

function withCrossTabLock(fn) {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request('pulse-refresh', fn);
  }
  return fn();
}

export function refreshSession() {
  if (inflight) return inflight;
  inflight = withCrossTabLock(callRefresh)
    .then((data) => {
      sessionEvents.emit('refreshed', data.user);
      return data;
    })
    .catch((err) => {
      // 401 (no/invalid cookie) and TOKEN_REUSED mean the session is gone.
      // Network errors and 5xx do NOT: the user may still be logged in.
      if (err instanceof ApiError && err.status === 401) {
        tokenStore.clear();
        sessionEvents.emit('expired', err.code === ERROR_CODES.TOKEN_REUSED ? 'reused' : 'expired');
      }
      throw err;
    })
    .finally(() => { inflight = null; });
  return inflight;
}
