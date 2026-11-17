import { X } from 'lucide-react';
import { cx } from '../../utils/cx.js';

export function Chip({ children, onRemove, removeLabel = 'Remove', className }) {
  return (
    <span className={cx('inline-flex h-6 items-center gap-1 rounded-sm border border-line bg-s2 pl-2 pr-1 text-[13px] text-ink', className)}>
      {children}
      {onRemove && (
        <button type="button" aria-label={removeLabel} onClick={onRemove} className="hit-44 grid size-5 place-items-center rounded-sm text-ink-muted [@media(hover:hover)]:hover:bg-s3">
          <X size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
      )}
    </span>
  );
}
