import { cloneElement, useEffect, useId, useRef, useState } from 'react';

// Desktop/hover only: 400ms delay on hover, immediate on keyboard focus. Never the only place an instruction lives.
export function Tooltip({ label, children, side = 'right' }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const hoverCapable = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches;

  const show = (delay) => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(true), delay); };
  const hide = () => { clearTimeout(timer.current); setOpen(false); };
  const pos = { right: 'left-full top-1/2 -translate-y-1/2 ml-2', top: 'bottom-full left-1/2 -translate-x-1/2 mb-2', bottom: 'top-full left-1/2 -translate-x-1/2 mt-2' }[side];

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={hoverCapable ? () => show(400) : undefined}
      onMouseLeave={hide}
      onFocus={(e) => { if (e.target.matches(':focus-visible')) show(0); }}
      onBlur={hide}
      onKeyDown={(e) => { if (e.key === 'Escape') hide(); }}
    >
      {cloneElement(children, { 'aria-describedby': open ? id : undefined })}
      {open && (
        <span id={id} role="tooltip" className={`pointer-events-none absolute z-[70] whitespace-nowrap rounded-sm bg-s3 px-2 py-1 text-xs text-ink ${pos}`}>
          {label}
        </span>
      )}
    </span>
  );
}
