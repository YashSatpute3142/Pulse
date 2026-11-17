import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useLayer } from '../../hooks/useLayer.js';
import { IconButton } from './IconButton.jsx';

/** Right drawer (320, --s1, shadow-float, scrim). Esc, scrim click and close button dismiss; focus returns to the trigger. */
export function Drawer({ open, onClose, title, children, width = 320 }) {
  const ref = useRef(null);
  const titleId = useId();
  useLayer(open, ref, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-30">
      <div className="anim-fade absolute inset-0 bg-[var(--scrim)]" onClick={onClose} aria-hidden="true" />
      <aside
        ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} style={{ width }}
        className="anim-drawer absolute inset-y-0 right-0 flex max-w-full flex-col border-l border-line bg-s1 shadow-float outline-none"
      >
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
          <h2 id={titleId} className="font-mono text-xs uppercase tracking-wider text-ink-faint">{title}</h2>
          <IconButton label="Close" onClick={onClose} tooltip={false}><X size={18} strokeWidth={1.5} aria-hidden="true" /></IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}
