import { useEffect, useRef } from 'react';

/**
 * Sentinel for cursor pagination. Attach the returned ref to an element at the end (or, for chat history, the top) of a
 * scroll area. Calls fetchNextPage when it comes into view. `rootRef` = the scroll container (null = viewport).
 */
export function useInfiniteScroll({ hasNextPage, isFetching, fetchNextPage, rootRef, rootMargin = '200px' }) {
  const sentinel = useRef(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !isFetching) fetchNextPage();
    }, { root: rootRef?.current ?? null, rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetching, fetchNextPage, rootRef, rootMargin]);
  return sentinel;
}
