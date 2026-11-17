import { cx } from '../../utils/cx.js';

export function CountPill({ count, label, className }) {
  if (!count) return null;
  const shown = count > 99 ? '99+' : count;
  return (
    <span aria-label={label || `${count} unread`} className={cx('inline-grid min-w-[18px] place-items-center rounded-full bg-accent px-1.5 font-mono text-[11px] font-medium leading-[18px] text-on-accent', className)}>
      <span aria-hidden="true">{shown}</span>
    </span>
  );
}
