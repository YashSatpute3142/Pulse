/** Only same-origin app paths. Blocks open redirects such as //evil.com or https://evil.com. */
export function safeRedirect(from, fallback = '/') {
  if (typeof from !== 'string') return fallback;
  if (!from.startsWith('/') || from.startsWith('//') || from.startsWith('/\\')) return fallback;
  if (from === '/login' || from === '/register') return fallback;
  return from;
}
