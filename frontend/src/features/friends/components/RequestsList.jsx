import { Inbox } from 'lucide-react';
import { UserRow } from '../../../components/common/UserRow.jsx';
import { EmptyState } from '../../../components/common/EmptyState.jsx';
import { ErrorState } from '../../../components/common/ErrorState.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Skeleton } from '../../../components/ui/Skeleton.jsx';
import { useToast } from '../../../components/ui/Toast.jsx';
import { useFriendMutations, useFriendRequests } from '../../../hooks/useFriends.js';

function SectionTitle({ children }) {
  return <h3 className="px-4 pb-1 pt-4 font-mono text-xs uppercase tracking-wider text-ink-faint">{children}</h3>;
}

export function RequestsList() {
  const toast = useToast();
  const { data, isPending, isError, error, refetch } = useFriendRequests();
  const { accept, decline } = useFriendMutations();
  const onError = (e) => toast.error(e.message);

  if (isPending) return <div className="flex flex-col gap-2 p-4" aria-busy="true"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>;
  if (isError) return <ErrorState title="Could not load requests" message={error?.message} onRetry={() => refetch()} />;
  const { incoming, outgoing } = data;
  if (!incoming.length && !outgoing.length) return <EmptyState icon={Inbox} title="No pending requests" description="Requests you send or receive show up here." />;
  return (
    <div>
      {incoming.length > 0 && (
        <section aria-label="Incoming requests">
          <SectionTitle>Incoming</SectionTitle>
          <ul>{incoming.map(({ user }) => (
            <li key={user.id}><UserRow user={user} actions={(
              <>
                <Button size="sm" onClick={() => accept.mutate(user.id, { onError })} disabled={accept.isPending || decline.isPending} aria-label={`Accept ${user.displayName}`}>Accept</Button>
                <Button size="sm" variant="secondary" onClick={() => decline.mutate(user.id, { onError })} disabled={accept.isPending || decline.isPending} aria-label={`Decline ${user.displayName}`}>Decline</Button>
              </>
            )} /></li>
          ))}</ul>
        </section>
      )}
      {outgoing.length > 0 && (
        <section aria-label="Sent requests">
          <SectionTitle>Sent</SectionTitle>
          <ul>{outgoing.map(({ user }) => (
            <li key={user.id}><UserRow user={user} actions={(
              <>
                <span className="text-sm text-ink-muted">Requested</span>
                <Button size="sm" variant="ghost" onClick={() => decline.mutate(user.id, { onError })} disabled={decline.isPending} aria-label={`Cancel request to ${user.displayName}`}>Cancel</Button>
              </>
            )} /></li>
          ))}</ul>
        </section>
      )}
    </div>
  );
}
