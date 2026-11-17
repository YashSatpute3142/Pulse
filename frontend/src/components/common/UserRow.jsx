import { Avatar } from '../ui/Avatar.jsx';

/** Min-56 row: avatar 36 + presence, name 500, @username mono muted, actions on the right. */
export function UserRow({ user, presence, actions }) {
  return (
    <div className="flex min-h-14 items-center gap-3 px-4 py-2">
      <Avatar name={user.displayName} src={user.avatarUrl} presence={presence} ringClass="ring-canvas" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink">{user.displayName}</div>
        <div className="truncate font-mono text-xs text-ink-muted">@{user.username}</div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
