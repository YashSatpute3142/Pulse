import { cx } from '../../utils/cx.js';

export function Field({ label, htmlFor, helper, helperId, error, errorId, children, className }) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      {label && <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink">{label}</label>}
      {children}
      {helper && !error && <p id={helperId} className="text-[13px] text-ink-muted">{helper}</p>}
      {error && <p id={errorId} className="text-[13px] text-danger">{error}</p>}
    </div>
  );
}

export const fieldBase =
  'w-full rounded-md border bg-s2 px-3 text-ink placeholder:text-ink-faint transition-colors duration-[120ms] disabled:opacity-50 disabled:pointer-events-none';
