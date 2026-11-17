import { useEffect, useId, useRef, useState } from 'react';
import { cx } from '../../utils/cx.js';

/**
 * Dropdown menu. items: [{ label, icon?, onSelect, destructive?, disabled? } | 'separator'].
 * Arrow keys, Home/End, typeahead, Esc closes and restores focus. Destructive = danger icon + normal label.
 * `trigger` is a render prop: ({ ref, props }) => element. Not portalled; do not place inside overflow-hidden parents.
 */
export function Menu({ trigger, items, align = 'right', label }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const menuId = useId();
  const typed = useRef({ s: '', t: null });

  const entries = () => [...(listRef.current?.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])') || [])];
  const close = (restore = true) => { setOpen(false); if (restore) triggerRef.current?.focus(); };

  useEffect(() => { if (open) entries()[0]?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!listRef.current?.contains(e.target) && !triggerRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const onKeyDown = (e) => {
    const list = entries(); const i = list.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); list[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); list[list.length - 1]?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      clearTimeout(typed.current.t);
      typed.current.s += e.key.toLowerCase();
      typed.current.t = setTimeout(() => { typed.current.s = ''; }, 500);
      list.find((n) => n.textContent.trim().toLowerCase().startsWith(typed.current.s))?.focus();
    }
  };

  return (
    <div className="relative inline-flex">
      {trigger({
        ref: triggerRef,
        props: { 'aria-haspopup': 'menu', 'aria-expanded': open, 'aria-controls': open ? menuId : undefined, onClick: () => setOpen((o) => !o) },
      })}
      {open && (
        <div
          id={menuId} ref={listRef} role="menu" aria-label={label} onKeyDown={onKeyDown}
          className={cx('absolute top-full z-20 mt-1 min-w-[180px] rounded-md border border-line-strong bg-s2 p-1 shadow-float', align === 'right' ? 'right-0' : 'left-0')}
        >
          {items.map((it, i) => it === 'separator'
            ? <div key={`s${i}`} role="separator" className="my-1 border-t border-line" />
            : (
              <button
                key={it.label} type="button" role="menuitem" tabIndex={-1} aria-disabled={it.disabled || undefined}
                onClick={() => { if (it.disabled) return; close(); it.onSelect?.(); }}
                className={cx('flex h-9 w-full items-center gap-2 rounded-sm px-3 text-left text-sm text-ink hit-coarse [@media(hover:hover)]:hover:bg-s3 focus-visible:bg-s3', it.disabled && 'opacity-50')}
              >
                {it.icon && <span aria-hidden="true" className={it.destructive ? 'text-danger' : 'text-ink-muted'}>{it.icon}</span>}
                {it.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
