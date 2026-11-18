import { useEffect, useState } from 'react';

/** Current time in ms, refreshed every `everyMs` so relative labels ("2m ago") stay fresh without per-render Date.now(). */
export function useNow(everyMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), everyMs); return () => clearInterval(t); }, [everyMs]);
  return now;
}
