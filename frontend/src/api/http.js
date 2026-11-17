import { API_BASE } from '../constants/config.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { ApiError } from './ApiError.js';

/**
 * One fetch, no auth logic. Returns the parsed body ({data, meta}) or throws ApiError.
 * 204 resolves to { data: null }.
 */
export async function httpRequest(path, { method = 'GET', body, headers = {}, token, signal, formData } = {}) {
  const init = {
    method,
    credentials: 'include', // refresh cookie pulse_rt
    signal,
    headers: { Accept: 'application/json', ...headers },
  };
  if (token) init.headers.Authorization = `Bearer ${token}`;
  if (formData) {
    init.body = formData; // browser sets multipart boundary
  } else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError({ status: 0, code: ERROR_CODES.NETWORK, message: 'Cannot reach the server. Check your connection.' });
  }

  if (res.status === 204) return { data: null };

  let json = null;
  try { json = await res.json(); } catch { /* non-JSON body */ }

  if (!res.ok) {
    const e = json?.error;
    throw new ApiError({
      status: res.status,
      code: e?.code || (res.status === 429 ? ERROR_CODES.RATE_LIMITED : ERROR_CODES.UNKNOWN),
      message: e?.message || 'Something went wrong.',
      details: e?.details || null,
      retryAfter: Number(res.headers.get('Retry-After')) || null,
    });
  }
  return json ?? { data: null };
}
