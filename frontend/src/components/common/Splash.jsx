import { Mark } from './Logo.jsx';

/** App boot splash: --canvas, mark 48 centred, no animation. Shown until the refresh call resolves. */
export function Splash() {
  return (
    <div role="status" className="grid min-h-dvh place-items-center bg-canvas">
      <Mark size={48} title="Pulse" />
      <span className="sr-only">Loading Pulse</span>
    </div>
  );
}
