import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/** Route change: move focus to the page h1 (DESIGN_SYSTEM 11). Attach the returned ref to the h1 (tabIndex -1). */
export function usePageFocus() {
  const ref = useRef(null);
  const { pathname } = useLocation();
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, [pathname]);
  return ref;
}
