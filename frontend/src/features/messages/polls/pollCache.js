import { queryKeys } from '../../../api/queryKeys.js';

/** Poll { id, question, options[{id,text}], multiple, anonymous, closesAt, closedAt, counts{optionId:n}, myVote[] } */
export const setPoll = (qc, poll) => poll?.id && qc.setQueryData(queryKeys.polls.detail(poll.id), poll);

/** Server truth for counts / closedAt, and my vote when the server sends it (own other sockets, vote ACK). */
export const applyServerPoll = (poll, p) => ({ ...poll, counts: p.counts ?? poll.counts, closedAt: p.closedAt !== undefined ? p.closedAt : poll.closedAt, myVote: Array.isArray(p.myVote) ? p.myVote : poll.myVote });

export function patchPoll(qc, pollId, fn) {
  qc.setQueryData(queryKeys.polls.detail(pollId), (p) => (p ? fn(p) : p));
}

/** Local effect of a vote change: counts shift by the difference between my old and new selection. */
export function withVote(poll, optionIds) {
  const counts = { ...poll.counts };
  for (const id of poll.myVote || []) if (!optionIds.includes(id)) counts[id] = Math.max(0, (counts[id] || 0) - 1);
  for (const id of optionIds) if (!(poll.myVote || []).includes(id)) counts[id] = (counts[id] || 0) + 1;
  return { ...poll, counts, myVote: optionIds };
}

/** Next selection when option `id` is clicked. Single choice: pick it, click again retracts. Multiple: toggle. */
export function nextSelection(poll, id) {
  const mine = poll.myVote || [];
  if (poll.multiple) return mine.includes(id) ? mine.filter((x) => x !== id) : [...mine, id];
  return mine.includes(id) ? [] : [id];
}

export const isClosed = (poll, now) => !!poll.closedAt || (!!poll.closesAt && new Date(poll.closesAt).getTime() <= now);
export const totalVotes = (poll) => Object.values(poll.counts || {}).reduce((a, b) => a + b, 0);
