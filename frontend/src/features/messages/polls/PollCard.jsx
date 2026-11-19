import { Check } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { pollsApi } from '../../../api/endpoints/extras.js';
import { queryKeys } from '../../../api/queryKeys.js';
import { C2S } from '../../../constants/eventTypes.js';
import { useSocket } from '../../../socket/useSocket.js';
import { useToast } from '../../../components/ui/Toast.jsx';
import { Skeleton } from '../../../components/ui/Skeleton.jsx';
import { useNow } from '../../../hooks/useNow.js';
import { clock } from '../../../utils/time.js';
import { cx } from '../../../utils/cx.js';
import { isClosed, nextSelection, patchPoll, totalVotes, withVote } from './pollCache.js';

/** Inline poll card, 440 max: question 600, mono sub-line, 36px option bars with an --accent-soft fill (180 ms), mono percent, voted = check + accent border. */
export function PollCard({ pollId }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { send } = useSocket();
  const now = useNow(30000);
  const q = useQuery({ queryKey: queryKeys.polls.detail(pollId), queryFn: () => pollsApi.get(pollId), staleTime: Infinity });

  if (q.isPending) return <Skeleton className="h-32 w-full max-w-[440px]" />;
  if (q.isError) return <p className="text-sm text-ink-muted">Could not load this poll. <button type="button" className="text-accent-text underline" onClick={() => q.refetch()}>Retry</button></p>;
  const poll = q.data;
  const closed = isClosed(poll, now);
  const total = totalVotes(poll);

  const vote = async (optionId) => {
    if (closed) return;
    const ids = nextSelection(poll, optionId);
    const before = poll;
    patchPoll(qc, poll.id, (p) => withVote(p, ids));
    try { await send(C2S.POLL_VOTE, { pollId: poll.id, optionIds: ids }); } catch (e) {
      patchPoll(qc, poll.id, () => before);
      toast.error(e?.message || 'Your vote was not saved');
    }
  };
  const meta = [`${total} ${total === 1 ? 'vote' : 'votes'}`, poll.multiple ? 'multiple choice' : 'single choice', poll.anonymous ? 'anonymous' : null,
    closed ? 'closed' : poll.closesAt ? `closes ${clock(new Date(poll.closesAt))}` : null].filter(Boolean).join(' · ');

  return (
    <div role="group" aria-label={`Poll: ${poll.question}`} className="w-full max-w-[440px] rounded-lg border border-line bg-s2 p-4">
      <p className="text-[15px] font-semibold text-ink">{poll.question}</p>
      <p className="mt-0.5 font-mono text-xs text-ink-muted">{meta}</p>
      <ul className="mt-3 flex flex-col gap-2">
        {poll.options.map((o) => {
          const n = poll.counts?.[o.id] || 0;
          const pct = total ? Math.round((n / total) * 100) : 0;
          const mine = (poll.myVote || []).includes(o.id);
          return (
            <li key={o.id}>
              <button type="button" role={poll.multiple ? 'checkbox' : 'radio'} aria-checked={mine} disabled={closed} onClick={() => vote(o.id)}
                className={cx('hit-coarse relative flex h-9 w-full items-center gap-2 overflow-hidden rounded-md border px-3 text-left text-sm text-ink disabled:cursor-default',
                  mine ? 'border-accent' : 'border-line', !closed && '[@media(hover:hover)]:hover:bg-s3')}>
                <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-accent-soft transition-[width] duration-[180ms]" style={{ width: `${pct}%` }} />
                <span className="relative flex min-w-0 flex-1 items-center gap-2">
                  {mine && <Check size={14} strokeWidth={2} aria-hidden="true" className="shrink-0 text-accent-text" />}
                  <span className="truncate">{o.text}</span>
                </span>
                <span className="relative font-mono text-xs text-ink-muted">{pct}%<span className="sr-only"> ({n} {n === 1 ? 'vote' : 'votes'})</span></span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
