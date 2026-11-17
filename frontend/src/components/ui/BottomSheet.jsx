import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLayer } from '../../hooks/useLayer.js';
import { cx } from '../../utils/cx.js';

/**
 * Mobile sheet: radius 12 top, drag handle 4x36 --control, scrim, max 85dvh, pb-safe, focus trap,
 * Esc/backdrop/swipe-down dismiss (DESIGN_SYSTEM 6.4). Swipe works from the handle/header area.
 */
export function BottomSheet({ open, onClose, title, children, fullHeight = false, className }) {
  const ref = useRef(null);
  const drag = useRef(null);
  const titleId = useId();
  useLayer(open, ref, onClose);
  if (!open) return null;

  const onPointerDown = (e) => { drag.current = { y: e.clientY }; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const dy = Math.max(0, e.clientY - drag.current.y);
    ref.current.style.transform = `translateY(${dy}px)`;
    drag.current.dy = dy;
  };
  const onPointerUp = () => {
    const dy = drag.current?.dy || 0;
    drag.current = null;
    if (dy > 96) onClose?.();
    else if (ref.current) ref.current.style.transform = '';
  };

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="anim-fade absolute inset-0 bg-[var(--scrim)]" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} tabIndex={-1}
        className={cx('anim-sheet pb-safe absolute inset-x-0 bottom-0 flex flex-col rounded-t-lg border-t border-line bg-s1 shadow-float outline-none', fullHeight ? 'h-[85dvh]' : 'max-h-[85dvh]', className)}
      >
        <div className="touch-none" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <div className="mx-auto mt-2 mb-1 h-1 w-9 rounded-full bg-control" aria-hidden="true" />
          {title && <h2 id={titleId} className="px-4 pb-2 pt-1 font-display text-lg font-semibold text-ink">{title}</h2>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
