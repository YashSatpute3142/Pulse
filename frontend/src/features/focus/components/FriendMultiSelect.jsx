import { useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar.jsx';
import { Skeleton } from '../../../components/ui/Skeleton.jsx';
import { SearchField } from '../../../components/common/SearchField.jsx';
import { EmptyState } from '../../../components/common/EmptyState.jsx';
import { ErrorState } from '../../../components/common/ErrorState.jsx';
import { useFriends } from '../../../hooks/useFriends.js';
import { cx } from '../../../utils/cx.js';

/** Checkbox list of friends. `exclude` = user ids to hide (already in the room). `value` = picked ids. */
export function FriendMultiSelect({ value, onChange, exclude = [], max = 19 }) {
  const friends = useFriends();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (friends.data || []).map((f) => f.user)
      .filter((u) => !exclude.includes(u.id) && (!needle || u.displayName.toLowerCase().includes(needle) || u.username.toLowerCase().includes(needle)));
  }, [friends.data, q, exclude]);
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : value.length < max ? [...value, id] : value);

  return (
    <div className="flex flex-col gap-2">
      <SearchField value={q} onChange={setQ} placeholder="Search friends" />
      <div className="-mx-4 max-h-[32dvh] overflow-y-auto border-y border-line">
        {friends.isPending && <div className="flex flex-col gap-2 p-4"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>}
        {friends.isError && <ErrorState title="Could not load friends" message={friends.error?.message} onRetry={() => friends.refetch()} />}
        {friends.isSuccess && (list.length === 0
          ? <EmptyState icon={Users} title="No friends to invite" description="Friends you have not already added show up here." />
          : list.map((u) => {
            const on = value.includes(u.id);
            return (
              <button key={u.id} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(u.id)}
                className={cx('flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left [@media(hover:hover)]:hover:bg-s3', on && 'bg-accent-soft')}>
                <Avatar name={u.displayName} src={u.avatarUrl} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{u.displayName}</span>
                  <span className="block truncate font-mono text-xs text-ink-muted">@{u.username}</span>
                </span>
                <span aria-hidden="true" className={cx('ml-auto grid size-5 place-items-center rounded-sm border', on ? 'border-accent bg-accent text-on-accent' : 'border-control')}>{on ? '✓' : ''}</span>
              </button>
            );
          }))}
      </div>
    </div>
  );
}
