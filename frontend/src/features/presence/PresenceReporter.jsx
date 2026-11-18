import { useEffect } from 'react';
import { useSocket } from '../../socket/useSocket.js';
import { C2S } from '../../constants/eventTypes.js';

const IDLE_MS = 2 * 60 * 1000;
const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];

/** Reports 'away' after 2 min without input (or when the tab is hidden) and 'online' on return (USER_STATUS). Renders nothing. */
export function PresenceReporter() {
  const { status, send } = useSocket();
  useEffect(() => {
    if (status !== 'open') return undefined;
    let current = 'online'; // the server marks us online on REGISTER
    let timer = null;
    const report = (s) => { if (s === current) return; current = s; send(C2S.USER_STATUS, { status: s }).catch(() => {}); };
    const armIdle = () => { clearTimeout(timer); timer = setTimeout(() => report('away'), IDLE_MS); };
    const activity = () => { if (document.visibilityState === 'hidden') return; report('online'); armIdle(); };
    const onVisibility = () => { if (document.visibilityState === 'hidden') { clearTimeout(timer); report('away'); } else activity(); };
    EVENTS.forEach((e) => window.addEventListener(e, activity, { passive: true }));
    document.addEventListener('visibilitychange', onVisibility);
    armIdle();
    return () => {
      clearTimeout(timer);
      EVENTS.forEach((e) => window.removeEventListener(e, activity));
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [status, send]);
  return null;
}
