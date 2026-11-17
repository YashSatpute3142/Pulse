import { useEffect, useState } from 'react';

/**
 * Keyboard-aware viewport (DESIGN_SYSTEM 6.4). Returns { height, offsetTop, keyboardOpen }.
 * keyboardOpen = the visual viewport is much shorter than the layout viewport.
 * Emulation cannot prove real iOS/Android behaviour; verify on a device.
 */
export function useVisualViewport() {
  const read = () => {
    const vv = window.visualViewport;
    if (!vv) return { height: window.innerHeight, offsetTop: 0, keyboardOpen: false };
    return { height: vv.height, offsetTop: vv.offsetTop, keyboardOpen: window.innerHeight - vv.height > 120 };
  };
  const [state, setState] = useState(read);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const on = () => setState(read());
    vv.addEventListener('resize', on);
    vv.addEventListener('scroll', on);
    return () => { vv.removeEventListener('resize', on); vv.removeEventListener('scroll', on); };
  }, []);
  return state;
}
