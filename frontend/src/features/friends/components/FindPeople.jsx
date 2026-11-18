import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SearchX, UserSearch } from 'lucide-react';
import { UserRow } from '../../../components/common/UserRow.jsx';
import { SearchField } from '../../../components/common/SearchField.jsx';
import { EmptyState } from '../../../components/common/EmptyState.jsx';
import { ErrorState } from '../../../components/common/ErrorState.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Skeleton } from '../../../components/ui/Skeleton.jsx';
import { useToast } from '../../../components/ui/Toast.jsx';
import { usersApi } from '../../../api/endpoints/users.js';
import { queryKeys } from '../../../api/queryKeys.js';
import { useFriendMutations, useFriendRequests, useFriends } from '../../../hooks/useFriends.js';
import { useDebounce } from '../../../hooks/useDebounce.js';
import { ERROR_CODES } from '../../../constants/errorCodes.js';

const MIN_QUERY = 2;

/** Search by username/display name (API_CONTRACT 4.2). The action reflects the existing relationship. */
export function FindPeople() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [sent, setSent] = useState(() => new Set()); // requested during this visit (also covers a 409 "already requested")
  const term = useDebounce(q.trim(), 300);
  const enabled = term.length >= MIN_QUERY;
  const results = useQuery({ queryKey: queryKeys.users.search(term), queryFn: () => usersApi.search(term), enabled });
  const friends = useFriends();
  const requests = useFriendRequests();
  const { sendRequest, accept } = useFriendMutations();

  const friendIds = new Set((friends.data || []).map((f) => f.user.id));
  const outgoing = new Set((requests.data?.outgoing || []).map((f) => f.user.id));
  const incoming = new Set((requests.data?.incoming || []).map((f) => f.user.id));

  const add = (user) => sendRequest.mutate(user.id, {
    onSuccess: () => setSent((s) => new Set(s).add(user.id)),
    onError: (e) => { if (e.code === ERROR_CODES.CONFLICT) setSent((s) => new Set(s).add(user.id)); else toast.error(e.message); },
  });

  const action = (user) => {
    if (friendIds.has(user.id)) return <span className="text-sm text-ink-muted">Friends</span>;
    if (outgoing.has(user.id) || sent.has(user.id)) return <span className="text-sm text-ink-muted">Requested</span>;
    if (incoming.has(user.id)) return <Button size="sm" onClick={() => accept.mutate(user.id, { onError: (e) => toast.error(e.message) })}>Accept</Button>;
    return <Button size="sm" variant="secondary" onClick={() => add(user)} disabled={sendRequest.isPending} aria-label={`Add ${user.displayName}`}>Add</Button>;
  };

  return (
    <div>
      <div className="p-4"><SearchField value={q} onChange={setQ} placeholder="Search by name or username" /></div>
      {!enabled && <EmptyState icon={UserSearch} title="Find people" description={`Type at least ${MIN_QUERY} characters of a name or username.`} />}
      {enabled && results.isFetching && !results.data && <div className="flex flex-col gap-2 px-4" aria-busy="true"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>}
      {enabled && results.isError && <ErrorState title="Search failed" message={results.error?.message} onRetry={() => results.refetch()} />}
      {enabled && results.isSuccess && (results.data.length === 0
        ? <EmptyState icon={SearchX} title="No one found" description={`No username or name starts with “${term}”.`} />
        : <ul>{results.data.map((u) => <li key={u.id}><UserRow user={u} actions={action(u)} /></li>)}</ul>)}
    </div>
  );
}
