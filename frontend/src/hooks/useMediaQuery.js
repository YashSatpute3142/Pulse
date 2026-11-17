import { useSyncExternalStore } from 'react';

export function useMediaQuery(query) {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(query); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
export const useIsMobile = () => !useMediaQuery('(min-width: 768px)');
export const useIsDesktop = () => useMediaQuery('(min-width: 1280px)');
