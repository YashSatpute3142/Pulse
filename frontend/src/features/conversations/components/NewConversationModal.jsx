import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal.jsx';
import { Tabs } from '../../../components/ui/Tabs.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Input } from '../../../components/ui/Input.jsx';
import { Chip } from '../../../components/ui/Chip.jsx';
import { Avatar } from '../../../components/ui/Avatar.jsx';
import { Skeleton } from '../../../components/ui/Skeleton.jsx';
import { SearchField } from '../../../components/common/SearchField.jsx';
import { EmptyState } from '../../../components/common/EmptyState.jsx';
import { ErrorState } from '../../../components/common/ErrorState.jsx';
import { useFriends } from '../../../hooks/useFriends.js';
import { useCreateConversation } from '../hooks/useConversations.js';
import { cx } from '../../../utils/cx.js';

const MIN_OTHERS = 2; // API_CONTRACT 4.4: groups take 2-49 others, all friends
const MAX_OTHERS = 49;

/** New conversation (modal on desktop, sheet on mobile). Only friends are listed. Direct: click a row. Group: pick 2+ and name it. */
export function NewConversationModal({ open, onClose }) {
  const navigate = useNavigate();
  const friends = useFriends();
  const create = useCreateConversation();
  const [tab, setTab] = useState('direct');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState([]); // user objects
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (friends.data || []).map((f) => f.user).filter((u) => !needle || u.displayName.toLowerCase().includes(needle) || u.username.toLowerCase().includes(needle));
  }, [friends.data, q]);

  const close = () => { setTab('direct'); setQ(''); setPicked([]); setTitle(''); setError(''); onClose(); };
  const done = (conv) => { close(); navigate(`/messages/${conv.id}`); };
  const fail = (e) => setError(e?.message || 'Could not create the conversation.');

  const startDirect = (user) => { setError(''); create.mutate({ type: 'direct', userId: user.id }, { onSuccess: done, onError: fail }); };
  const toggle = (user) => setPicked((p) => (p.some((x) => x.id === user.id) ? p.filter((x) => x.id !== user.id) : p.length < MAX_OTHERS ? [...p, user] : p));
  const canCreate = tab === 'group' && picked.length >= MIN_OTHERS && title.trim().length > 0;
  const createGroup = () => { setError(''); create.mutate({ type: 'group', title: title.trim(), memberIds: picked.map((u) => u.id) }, { onSuccess: done, onError: fail }); };

  return (
    <Modal
      open={open} onClose={close} title="New conversation"
      footer={(<>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        {tab === 'group' && <Button onClick={createGroup} disabled={!canCreate} loading={create.isPending}>Create</Button>}
      </>)}
    >
      <div className="flex flex-col gap-3">
        <Tabs label="Conversation type" value={tab} onChange={(t) => { setTab(t); setError(''); }} items={[{ value: 'direct', label: 'Direct' }, { value: 'group', label: 'Group' }]} />
        {tab === 'group' && (
          <>
            <Input label="Group name" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} helper={`Pick at least ${MIN_OTHERS} friends. ${picked.length} selected.`} />
            {picked.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {picked.map((u) => <Chip key={u.id} onRemove={() => toggle(u)} removeLabel={`Remove ${u.displayName}`}>{u.displayName}</Chip>)}
              </div>
            )}
          </>
        )}
        <SearchField value={q} onChange={setQ} placeholder="Search friends" />
        {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
        <div className="-mx-4 max-h-[40dvh] overflow-y-auto border-y border-line">
          {friends.isPending && <div className="flex flex-col gap-2 p-4"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>}
          {friends.isError && <ErrorState title="Could not load friends" message={friends.error?.message} onRetry={() => friends.refetch()} />}
          {friends.isSuccess && (friends.data.length === 0
            ? <EmptyState icon={Users} title="No friends yet" description="You can only message friends." action={<Link to="/friends" onClick={close} className="text-sm font-medium text-accent-text">Find people</Link>} />
            : list.length === 0
              ? <p className="p-4 text-sm text-ink-muted">No friends match &ldquo;{q}&rdquo;.</p>
              : list.map((u) => {
                const on = picked.some((x) => x.id === u.id);
                return tab === 'direct' ? (
                  <button key={u.id} type="button" onClick={() => startDirect(u)} disabled={create.isPending} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left [@media(hover:hover)]:hover:bg-s3 disabled:opacity-50">
                    <Row user={u} />
                  </button>
                ) : (
                  <button key={u.id} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(u)} className={cx('flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left [@media(hover:hover)]:hover:bg-s3', on && 'bg-accent-soft')}>
                    <Row user={u} />
                    <span aria-hidden="true" className={cx('ml-auto grid size-5 place-items-center rounded-sm border', on ? 'border-accent bg-accent text-on-accent' : 'border-control')}>{on ? '✓' : ''}</span>
                  </button>
                );
              }))}
        </div>
      </div>
    </Modal>
  );
}

function Row({ user }) {
  return (
    <>
      <Avatar name={user.displayName} src={user.avatarUrl} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-ink">{user.displayName}</span>
        <span className="block truncate font-mono text-xs text-ink-muted">@{user.username}</span>
      </span>
    </>
  );
}
