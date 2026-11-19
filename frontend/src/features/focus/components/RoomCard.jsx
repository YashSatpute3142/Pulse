import { Link } from 'react-router-dom';
import { Timer } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar.jsx';
import { STATUS_LABEL } from '../constants.js';
import { clock } from '../../../utils/time.js';
import { cx } from '../../../utils/cx.js';

export function RoomCard({ room }) {
  const running = room.status === 'running';
  const shown = room.participants.slice(0, 4);
  return (
    <Link to={`/focus/${room.id}`} className="block rounded-lg border border-line bg-s2 p-4 [@media(hover:hover)]:hover:bg-s3">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-s3 text-ink"><Timer size={18} strokeWidth={1.5} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold text-ink">{room.title}</h3>
          <p className="font-mono text-xs text-ink-muted">
            {Math.round(room.durationSec / 60)} min · <span className={cx(running && 'text-live')}>{STATUS_LABEL[room.status] || room.status}</span>
            {running && room.endsAt ? ` · ends ${clock(new Date(room.endsAt))}` : ''}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center">
        <div className="flex -space-x-2">{shown.map((p) => <Avatar key={p.user.id} name={p.user.displayName} src={p.user.avatarUrl} size={28} className="ring-2 ring-s2" />)}</div>
        <span className="ml-3 text-[13px] text-ink-muted">{room.participants.length} {room.participants.length === 1 ? 'person' : 'people'}</span>
      </div>
    </Link>
  );
}
