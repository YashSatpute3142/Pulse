import { forwardRef, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { Kbd } from '../ui/Kbd.jsx';
import { cx } from '../../utils/cx.js';

/** Search input. "/" focuses it from anywhere outside a text field (when `hotkey`). Height 38 desktop / 48 mobile. */
export const SearchField = forwardRef(function SearchField({ value, onChange, placeholder = 'Search', label, hotkey = false, disabled = false, className }, ref) {
  const inner = useRef(null);
  const el = ref || inner;
  useEffect(() => {
    if (!hotkey) return undefined;
    const onKey = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      el.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [hotkey, el]);

  return (
    <div className={cx('relative', className)}>
      <Search size={16} strokeWidth={1.5} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
      <input
        ref={el} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} aria-label={label || placeholder}
        className="h-12 w-full disabled:opacity-50 disabled:pointer-events-none rounded-md border border-control bg-s2 pl-9 pr-10 text-ink placeholder:text-ink-muted md:h-[38px]"
      />
      {hotkey && <span aria-hidden="true" className="absolute right-2 top-1/2 hidden -translate-y-1/2 md:block"><Kbd>/</Kbd></span>}
    </div>
  );
});
