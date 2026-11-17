import { useRef } from 'react';
import { cx } from '../../utils/cx.js';
import { CountPill } from './CountPill.jsx';

/** Controlled tablist. items: [{ value, label, count? }]. Panels are the caller's job (use aria-labelledby={`tab-${value}`}). */
export function Tabs({ items, value, onChange, label, className }) {
  const refs = useRef([]);
  const move = (i) => { const n = (i + items.length) % items.length; onChange(items[n].value); refs.current[n]?.focus(); };
  return (
    <div role="tablist" aria-label={label} className={cx('flex gap-1 border-b border-line', className)}>
      {items.map((t, i) => {
        const on = t.value === value;
        return (
          <button
            key={t.value} ref={(el) => { refs.current[i] = el; }} id={`tab-${t.value}`} role="tab" type="button"
            aria-selected={on} tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') { e.preventDefault(); move(i + 1); }
              if (e.key === 'ArrowLeft') { e.preventDefault(); move(i - 1); }
              if (e.key === 'Home') { e.preventDefault(); move(0); }
              if (e.key === 'End') { e.preventDefault(); move(items.length - 1); }
            }}
            className={cx('relative inline-flex h-10 items-center gap-2 px-3 text-sm font-medium hit-coarse', on ? 'text-ink' : 'text-ink-muted [@media(hover:hover)]:hover:text-ink')}
          >
            {t.label}
            {t.count ? <CountPill count={t.count} label={`${t.count} pending`} /> : null}
            {on && <span aria-hidden="true" className="absolute inset-x-2 -bottom-px h-0.5 bg-accent" />}
          </button>
        );
      })}
    </div>
  );
}
