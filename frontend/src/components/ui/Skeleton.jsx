import { cx } from '../../utils/cx.js';

// Static --s2 block fading 1 -> .6 over 1.6s (no shimmer). Reduced-motion rule in index.css flattens it.
export function Skeleton({ className, rounded = 'rounded-md' }) {
  return <div aria-hidden="true" className={cx('bg-s2 [animation:skeleton_1.6s_ease-in-out_infinite]', rounded, className)} />;
}
