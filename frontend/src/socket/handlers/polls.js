import { S2C } from '../../constants/eventTypes.js';
import { applyStoredMessage } from '../../features/messages/cacheUpdates.js';
import { patchPoll, setPoll } from '../../features/messages/polls/pollCache.js';

/** POLL_CREATED { poll, message } -> poll cache + the poll message; POLL_UPDATED { pollId, counts, closedAt } -> counts (my vote is kept). */
export function registerPollHandlers(bus, queryClient) {
  return [
    bus.subscribe(S2C.POLL_CREATED, (p) => { if (!p?.poll) return; setPoll(queryClient, p.poll); if (p.message) applyStoredMessage(queryClient, p.message); }),
    bus.subscribe(S2C.POLL_UPDATED, (p) => { if (p?.pollId) patchPoll(queryClient, p.pollId, (poll) => ({ ...poll, counts: p.counts ?? poll.counts, closedAt: p.closedAt ?? poll.closedAt })); }),
  ];
}
