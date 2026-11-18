import { useRef } from 'react';

/** Touch long-press (500 ms). Mouse and pen never trigger it. Moving more than 10px cancels. */
export function useLongPress(onLongPress, ms = 500) {
  const timer = useRef(null);
  const start = useRef(null);
  const cancel = () => { clearTimeout(timer.current); timer.current = null; };
  return {
    onPointerDown(e) {
      if (e.pointerType !== 'touch') return;
      start.current = { x: e.clientX, y: e.clientY };
      cancel();
      timer.current = setTimeout(() => { timer.current = null; onLongPress(e); }, ms);
    },
    onPointerMove(e) {
      if (!timer.current || !start.current) return;
      if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onContextMenu(e) { if (e.pointerType === 'touch' || window.matchMedia?.('(hover: none)').matches) e.preventDefault(); },
  };
}
