import { forwardRef } from 'react';
import { cx } from '../../utils/cx.js';
import { Spinner } from './Spinner.jsx';

const variants = {
  primary: 'bg-accent text-on-accent [@media(hover:hover)]:hover:bg-accent-hover',
  secondary: 'border border-control text-ink [@media(hover:hover)]:hover:bg-s3',
  ghost: 'text-ink-muted [@media(hover:hover)]:hover:bg-s3 [@media(hover:hover)]:hover:text-ink',
  danger: 'border border-danger text-danger [@media(hover:hover)]:hover:bg-s3',
};
const sizes = { md: 'h-9 px-4', sm: 'h-[30px] px-3' };

// Loading keeps width (content stays invisible beneath the spinner) and sets aria-busy.
export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading = false, disabled, className, children, type = 'button', ...rest }, ref,
) {
  const off = disabled || loading;
  return (
    <button
      ref={ref}
      type={type}
      aria-busy={loading || undefined}
      disabled={disabled}
      aria-disabled={loading || undefined}
      onClick={off ? (e) => e.preventDefault() : rest.onClick}
      {...{ ...rest, onClick: off ? (e) => e.preventDefault() : rest.onClick }}
      className={cx(
        'relative inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors duration-[120ms] active:opacity-90',
        'hit-coarse disabled:opacity-50 disabled:pointer-events-none',
        loading && 'pointer-events-none',
        variants[variant], sizes[size], className,
      )}
    >
      <span className={cx('inline-flex items-center gap-2', loading && 'invisible')}>{children}</span>
      {loading && <span className="absolute inset-0 grid place-items-center"><Spinner /></span>}
    </button>
  );
});
