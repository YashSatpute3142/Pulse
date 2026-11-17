import { cx } from '../../utils/cx.js';

const color = { online: 'bg-live', away: 'bg-away', offline: 'bg-offline' };
const text = { online: 'online', away: 'away', offline: 'offline' };

// 12px dot with a surface-coloured outline; only online pulses. Hidden text carries the status (never colour only).
export function PresenceDot({ status = 'offline', ringClass = 'ring-canvas', className }) {
  return (
    <span className={cx('relative inline-block size-3 rounded-full ring-2', ringClass, color[status], className)}>
      {status === 'online' && <span data-pulse aria-hidden="true" className="absolute inset-0 rounded-full border border-live animate-pulse-ring" />}
      <span className="sr-only">{text[status]}</span>
    </span>
  );
}
