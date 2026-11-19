import { Plus } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar.jsx';
import { clock } from '../../../utils/time.js';

/** Avatar 48 + name + mono join time, "host" label, dashed Invite circle (host only). */
export function ParticipantRow({ room, canInvite, onInvite }) {
  return (
    <ul className="flex flex-wrap items-start justify-center gap-4" aria-label="Participants">
      {room.participants.map((p) => (
        <li key={p.user.id} className="flex w-20 flex-col items-center gap-1 text-center">
          <Avatar name={p.user.displayName} src={p.user.avatarUrl} size={48} />
          <span className="w-full truncate text-[13px] font-medium text-ink">{p.user.displayName.split(' ')[0]}</span>
          <span className="font-mono text-[11px] text-ink-muted">{p.user.id === room.hostId ? 'host' : clock(new Date(p.joinedAt))}</span>
        </li>
      ))}
      {canInvite && (
        <li className="flex w-20 flex-col items-center gap-1">
          <button type="button" onClick={onInvite} aria-label="Invite friends"
            className="hit-coarse grid size-12 place-items-center rounded-full border border-dashed border-control text-ink-muted [@media(hover:hover)]:hover:border-ink-muted [@media(hover:hover)]:hover:text-ink">
            <Plus size={18} strokeWidth={1.5} aria-hidden="true" />
          </button>
          <span className="text-[13px] text-ink-muted">Invite</span>
        </li>
      )}
    </ul>
  );
}
