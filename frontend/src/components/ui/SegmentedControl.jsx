import { useRef } from 'react';
import { cx } from '../../utils/cx.js';

// role=radiogroup with roving tabindex and arrow keys.
export function SegmentedControl({ options, value, onChange, label, className }) {
  const refs = useRef([]);
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const move = (to) => {
    const next = (to + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className={cx('inline-flex rounded-md border border-control bg-s2 p-0.5', className)}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value} ref={(el) => { refs.current[i] = el; }} type="button" role="radio" aria-checked={on}
            tabIndex={i === idx ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(i + 1); }
              if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(i - 1); }
            }}
            className={cx('h-8 rounded-sm px-3 text-sm font-medium transition-colors duration-[120ms] hit-coarse', on ? 'bg-s3 text-ink' : 'text-ink-muted [@media(hover:hover)]:hover:text-ink')}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
