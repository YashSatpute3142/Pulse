import { useEffect, useRef } from 'react';

// Shared by Modal / BottomSheet / Drawer: focus trap, Esc, inert background, scroll lock, focus return.
let openLayers = 0;
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function useLayer(open, containerRef, onClose) {
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!open) return undefined;
    const trigger = document.activeElement;
    const root = document.getElementById('root');
    openLayers += 1;
    if (openLayers === 1) {
      root?.setAttribute('inert', '');
      document.body.style.overflow = 'hidden';
    }
    const el = containerRef.current;
    const focusables = () => [...(el?.querySelectorAll(FOCUSABLE) || [])].filter((n) => n.offsetParent !== null || n === document.activeElement);
    (focusables()[0] || el)?.focus();

    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current?.(); return; }
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0]; const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      openLayers -= 1;
      if (openLayers === 0) {
        root?.removeAttribute('inert');
        document.body.style.overflow = '';
      }
      if (trigger instanceof HTMLElement && document.contains(trigger)) trigger.focus();
    };
  }, [open, containerRef]);
}
