import { forwardRef } from 'react';
import { cx } from '../../utils/cx.js';
import { Tooltip } from './Tooltip.jsx';

// `label` is required: it is the aria-label and the desktop tooltip.
export const IconButton = forwardRef(function IconButton(
  { label, children, size = 36, tooltip = true, className, type = 'button', pressed, ...rest }, ref,
) {
  const btn = (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      aria-pressed={pressed}
      style={{ width: size, height: size }}
      className={cx(
        'inline-grid place-items-center rounded-md text-ink-muted transition-colors duration-[120ms]',
        '[@media(hover:hover)]:hover:bg-s3 [@media(hover:hover)]:hover:text-ink active:bg-s3',
        'disabled:opacity-50 disabled:pointer-events-none hit-coarse', className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
  return tooltip ? <Tooltip label={label}>{btn}</Tooltip> : btn;
});
