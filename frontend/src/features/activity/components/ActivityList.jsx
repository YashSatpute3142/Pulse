import { useNavigate } from 'react-router-dom';
import { Radio } from 'lucide-react';
import { EmptyState } from '../../../components/common/EmptyState.jsx';
import { ErrorState } from '../../../components/common/ErrorState.jsx';
import { Skeleton } from '../../../components/ui/Skeleton.jsx';
import { useToast } from '../../../components/ui/Toast.jsx';
import { useNow } from '../../../hooks/useNow.js';
import { useCreateConversation } from '../../conversations/hooks/useConversations.js';
import { useActivityFeed } from '../hooks/useActivity.js';
import { liveEntries } from '../cache.js';
import { ActivityCard } from './ActivityCard.jsx';

/** Friends' live activity cards, with loading / error / empty states. Shared by the panel, drawer and Activity page. */
export function ActivityList({ emptyAction }) {
  const navigate = useNavigate();
  const toast = useToast();
  const now = useNow();
  const { data, isPending, isError, error, refetch } = useActivityFeed();
  const create = useCreateConversation();
  const message = (user) => create.mutate({ type: 'direct', userId: user.id }, { onSuccess: (c) => navigate(`/messages/${c.id}`), onError: (e) => toast.error(e.message) });

  if (isPending) return <div className="flex flex-col gap-3 p-4" aria-busy="true"><Skeleton className="h-36" /><Skeleton className="h-36" /></div>;
  if (isError) return <ErrorState title="Could not load live activity" message={error?.message} onRetry={() => refetch()} />;
  const rows = liveEntries(data, now);
  if (!rows.length) {
    return <EmptyState icon={Radio} title="Nobody is live right now" description="When friends share what they are up to, it shows here." action={emptyAction} />;
  }
  return (
    <ul className="flex flex-col gap-3 p-4">
      {rows.map((e) => <li key={e.user.id}><ActivityCard user={e.user} activity={e.activity} now={now} onMessage={message} busy={create.isPending} /></li>)}
    </ul>
  );
}
