import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useLayer } from '../../hooks/useLayer.js';
import { useIsMobile } from '../../hooks/useMediaQuery.js';
import { BottomSheet } from './BottomSheet.jsx';
import { IconButton } from './IconButton.jsx';
import { cx } from '../../utils/cx.js';

/** Desktop modal (radius 12, width 480 default). On mobile it becomes a BottomSheet (DESIGN_SYSTEM 6.4). */
export function Modal({ open, onClose, title, children, footer, width = 480 }) {
  const mobile = useIsMobile();
  if (mobile) {
    return (
      <BottomSheet open={open} onClose={onClose} title={title}>
        <div className="px-4 pb-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </BottomSheet>
    );
  }
  return <DesktopModal open={open} onClose={onClose} title={title} footer={footer} width={width}>{children}</DesktopModal>;
}

function DesktopModal({ open, onClose, title, children, footer, width }) {
  const ref = useRef(null);
  const titleId = useId();
  useLayer(open, ref, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="anim-fade absolute inset-0 bg-[var(--scrim)]" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} style={{ maxWidth: width }}
        className={cx('anim-fade relative flex max-h-[85dvh] w-full flex-col rounded-lg border border-line-strong bg-s1 shadow-float outline-none')}
      >
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 id={titleId} className="font-display text-xl font-semibold text-ink">{title}</h2>
          <IconButton label="Close" onClick={onClose} tooltip={false}><X size={18} strokeWidth={1.5} aria-hidden="true" /></IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
