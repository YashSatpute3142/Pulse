// Access token lives in module memory only. Never localStorage/sessionStorage/cookies (ARCHITECTURE D3).
let accessToken = null;

export const tokenStore = {
  get: () => accessToken,
  set: (token) => { accessToken = token || null; },
  clear: () => { accessToken = null; },
};
