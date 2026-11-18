import { Lock } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { usePresence } from '../../presence/usePresence.js';
import { activityMeta } from '../constants.js';
import { formatAgo } from '../../../utils/time.js';
import { cx } from '../../../utils/cx.js';

const ring = { online: 'border-live', away: 'border-away', offline: 'border-control' };
const presenceText = { online: 'Online', away: 'Away', offline: 'Offline' };

/** Live Activity card (DESIGN_SYSTEM): s2, 1px border, radius 12, p-16. avatar 42 in a 54px ring. */
export function ActivityCard({ user, activity, now, onMessage, busy }) {
  const presence = usePresence(user.id);
  const { Icon, label: typeLabel } = activityMeta(activity.type);
  return (
    <article aria-label={`${user.displayName}, ${typeLabel}`} className="rounded-lg border border-line bg-s2 p-4">
      <div className="flex items-center gap-3">
        <span className={cx('grid size-[54px] shrink-0 place-items-center rounded-full border-2', ring[presence])}>
          <Avatar name={user.displayName} src={user.avatarUrl} size={42} />
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold text-ink">{user.displayName}</h3>
          <p className="text-[13px] text-ink-muted">{presenceText[presence]}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-sm bg-s3 text-ink"><Icon size={16} strokeWidth={1.5} aria-hidden="true" /></span>
        <p className="min-w-0 truncate font-display text-[19px] leading-6 text-ink">{activity.label || typeLabel}</p>
      </div>
      <p className="mt-1.5 font-mono text-xs text-ink-muted">{activity.label ? `${typeLabel} · ` : ''}updated {formatAgo(activity.updatedAt || activity.startedAt, now)}</p>
      {onMessage && <div className="mt-3"><Button size="sm" variant="secondary" onClick={() => onMessage(user)} disabled={busy}>Message</Button></div>}
    </article>
  );
}

/** Shown when a friend's activity exists but the viewer may not see it (only if the server sends a locked entry). */
export function LockedActivityCard() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed border-control bg-canvas p-4 text-sm text-ink-muted">
      <Lock size={16} strokeWidth={1.5} aria-hidden="true" /> Only friends can see this activity.
    </div>
  );
}
