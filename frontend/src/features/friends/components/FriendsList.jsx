import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreHorizontal, Ban, UserMinus, Users } from 'lucide-react';
import { UserRow } from '../../../components/common/UserRow.jsx';
import { EmptyState } from '../../../components/common/EmptyState.jsx';
import { ErrorState } from '../../../components/common/ErrorState.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { IconButton } from '../../../components/ui/IconButton.jsx';
import { Menu } from '../../../components/ui/Menu.jsx';
import { Skeleton } from '../../../components/ui/Skeleton.jsx';
import { useToast } from '../../../components/ui/Toast.jsx';
import { useFriendMutations, useFriends } from '../../../hooks/useFriends.js';
import { useCreateConversation } from '../../conversations/hooks/useConversations.js';
import { ConfirmDialog } from './ConfirmDialog.jsx';

export function FriendsList({ onFindPeople }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { data, isPending, isError, error, refetch } = useFriends();
  const { remove, block } = useFriendMutations();
  const create = useCreateConversation();
  const [confirm, setConfirm] = useState(null); // { kind: 'remove'|'block', user }

  const message = (user) => create.mutate({ type: 'direct', userId: user.id }, { onSuccess: (c) => navigate(`/messages/${c.id}`), onError: (e) => toast.error(e.message) });
  const run = () => {
    const m = confirm.kind === 'block' ? block : remove;
    m.mutate(confirm.user.id, { onSuccess: () => setConfirm(null), onError: (e) => { setConfirm(null); toast.error(e.message); } });
  };

  if (isPending) return <div className="flex flex-col gap-2 p-4" aria-busy="true"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /></div>;
  if (isError) return <ErrorState title="Could not load friends" message={error?.message} onRetry={() => refetch()} />;
  if (data.length === 0) {
    return <EmptyState icon={Users} title="No friends yet" description="Search by username to send a request." action={<Button variant="secondary" onClick={onFindPeople}>Find people</Button>} />;
  }
  return (
    <>
      <ul>
        {data.map(({ user }) => (
          <li key={user.id}>
            <UserRow user={user} live actions={(
              <>
                <Button size="sm" variant="ghost" onClick={() => message(user)} disabled={create.isPending}>Message</Button>
                <Menu
                  label={`More for ${user.displayName}`}
                  trigger={({ ref, props }) => <IconButton ref={ref} label={`More for ${user.displayName}`} tooltip={false} {...props}><MoreHorizontal size={18} strokeWidth={1.5} aria-hidden="true" /></IconButton>}
                  items={[
                    { label: 'Unfriend', icon: <UserMinus size={16} strokeWidth={1.5} />, destructive: true, onSelect: () => setConfirm({ kind: 'remove', user }) },
                    { label: 'Block', icon: <Ban size={16} strokeWidth={1.5} />, destructive: true, onSelect: () => setConfirm({ kind: 'block', user }) },
                  ]}
                />
              </>
            )} />
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={!!confirm} onClose={() => setConfirm(null)} onConfirm={run} loading={remove.isPending || block.isPending}
        title={confirm?.kind === 'block' ? `Block ${confirm?.user.displayName}?` : `Unfriend ${confirm?.user.displayName}?`}
        confirmLabel={confirm?.kind === 'block' ? 'Block' : 'Unfriend'}
        body={confirm?.kind === 'block' ? 'They will no longer be able to find or message you.' : 'You will stop seeing each other’s activity. You can send a new request later.'}
      />
    </>
  );
}
