// Public, build-time configuration. Only VITE_* values; never put secrets here.
const trimSlash = (s) => (s || '').replace(/\/+$/, '');

export const API_BASE = `${trimSlash(import.meta.env.VITE_API_URL)}/api/v1`;

/** WebSocket URL. Empty VITE_WS_URL means same-origin /ws (dev proxy). */
export function getWsUrl() {
  const configured = import.meta.env.VITE_WS_URL;
  if (configured) return configured;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

export const THEME_STORAGE_KEY = 'pulse-theme';
