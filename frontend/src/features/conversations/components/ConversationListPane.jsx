import { useMemo, useState } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { MessageSquare, SearchX } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SearchField } from '../../../components/common/SearchField.jsx';
import { EmptyState } from '../../../components/common/EmptyState.jsx';
import { ErrorState } from '../../../components/common/ErrorState.jsx';
import { Skeleton } from '../../../components/ui/Skeleton.jsx';
import { ConversationRow } from './ConversationRow.jsx';
import { NewConversationButton } from './NewConversationButton.jsx';
import { useConversations } from '../hooks/useConversations.js';
import { flattenConversations } from '../cache.js';
import { useAuth } from '../../auth/useAuth.js';
import { useDebounce } from '../../../hooks/useDebounce.js';
import { useInfiniteScroll } from '../../../hooks/useInfiniteScroll.js';
import { useIsMobile } from '../../../hooks/useMediaQuery.js';

function RowSkeletons() {
  return (
    <div aria-hidden="true" className="flex flex-col">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="flex min-h-16 items-center gap-3 px-4 py-2.5">
          <Skeleton className="size-9" rounded="rounded-full" />
          <div className="flex flex-1 flex-col gap-2"><Skeleton className="h-3.5 w-1/3" /><Skeleton className="h-3 w-3/4" /></div>
        </div>
      ))}
    </div>
  );
}

/** Inbox pane: 300 wide on desktop, the whole screen on mobile. Search is server-side (debounced), pagination by cursor. */
export function ConversationListPane({ showTitle = true }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const mobile = useIsMobile();
  const [q, setQ] = useState('');
  const query = useDebounce(q.trim(), 250);
  const { data, isPending, isError, error, refetch, hasNextPage, isFetching, isFetchingNextPage, fetchNextPage } = useConversations(query);
  const items = useMemo(() => flattenConversations(data), [data]);
  const selectedId = matchPath('/messages/:id', pathname)?.params.id;
  const sentinel = useInfiniteScroll({ hasNextPage, isFetching, fetchNextPage });

  return (
    <div className="flex h-full min-h-0 flex-col">
      {showTitle && (
        <div className="flex h-14 shrink-0 items-center justify-between px-4">
          <h2 className="font-display text-xl font-semibold text-ink">Messages</h2>
          <NewConversationButton />
        </div>
      )}
      <div className="px-4 pb-3"><SearchField value={q} onChange={setQ} placeholder="Search conversations" hotkey={!mobile} /></div>
      <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={isPending || undefined}>
        {isPending && <RowSkeletons />}
        {isError && <ErrorState title="Could not load conversations" message={error?.message} onRetry={() => refetch()} />}
        {!isPending && !isError && items.length === 0 && (query
          ? <EmptyState icon={SearchX} title="No matches" description={`Nothing found for “${query}”.`} />
          : <EmptyState icon={MessageSquare} title="No conversations yet" description="Find a friend to start one." action={<Link to="/friends" className="text-sm font-medium text-accent-text underline-offset-2 hover:underline">Find friends</Link>} />)}
        {items.length > 0 && (
          <ul>
            {items.map((c) => (
              <li key={c.id}><ConversationRow conversation={c} meId={user?.id} selected={c.id === selectedId} avatarSize={mobile ? 42 : 36} /></li>
            ))}
          </ul>
        )}
        {hasNextPage && <div ref={sentinel} className="h-8">{isFetchingNextPage && <RowSkeletons />}</div>}
      </div>
    </div>
  );
}
