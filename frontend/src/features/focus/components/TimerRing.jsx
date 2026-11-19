import { clock } from '../../../utils/time.js';
import { formatRemaining } from '../cache.js';
import { cx } from '../../../utils/cx.js';

const R = 150;
const C = 2 * Math.PI * R;

/** Ring 320 with 76px mono digits (DESIGN_SYSTEM Focus Room). Lobby: faint ring, full duration. Display only; the server decides completion. */
export function TimerRing({ room, remaining }) {
  const total = room.durationSec * 1000;
  const running = room.status === 'running';
  const done = room.status === 'completed';
  const progress = running ? Math.min(1, remaining / total) : done ? 0 : 1;
  const mins = Math.floor(Math.ceil(remaining / 1000) / 60);
  const secs = Math.ceil(remaining / 1000) % 60;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[320px]">
      <svg viewBox="0 0 320 320" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="160" cy="160" r={R} fill="none" strokeWidth="6" className="stroke-control" />
        <circle cx="160" cy="160" r={R} fill="none" strokeWidth="6" strokeLinecap="round"
          className={cx(running ? 'stroke-accent' : 'stroke-ink-faint')}
          strokeDasharray={C} strokeDashoffset={C * (1 - progress)} style={{ transition: 'stroke-dashoffset 1s linear' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
        <span role="timer" aria-label={`${mins} minutes ${secs} seconds ${running ? 'remaining' : ''}`}
          className={cx('font-mono text-[56px] leading-none sm:text-[76px]', running ? 'text-ink' : 'text-ink-faint')}>
          {formatRemaining(remaining)}
        </span>
        <span className="font-mono text-xs text-ink-muted">
          {running ? `remaining · ends ${clock(new Date(room.endsAt))}` : done ? 'session complete' : room.status === 'cancelled' ? 'room cancelled' : 'full session'}
        </span>
      </div>
    </div>
  );
}
