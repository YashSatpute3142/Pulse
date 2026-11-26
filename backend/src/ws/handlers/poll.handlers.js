import { C2S, S2C } from '../../constants/eventTypes.js';
import * as v from '../../validators/ws.validators.js';
import * as polls from '../../services/poll.service.js';

/**
 * Polls (protocol Section 5/6). Voters are never sent: POLL_UPDATED carries counts only, so anonymous polls cannot leak.
 * The voter's own ACK carries `myVote`; the voter's other tabs get counts only (the protocol has no per-user event for it).
 */
export const pollHandlers = [
  {
    type: C2S.POLL_CREATE, schema: v.pollCreatePayload,
    async run(ctx, payload) {
      const { poll, message, memberIds } = await polls.createPoll(ctx.userId, payload);
      return { data: { poll, message }, after: () => ctx.broadcast.toUsers(memberIds, S2C.POLL_CREATED, { poll, message }, { except: ctx.socket }) };
    },
  },
  {
    type: C2S.POLL_VOTE, schema: v.pollVotePayload,
    async run(ctx, { pollId, optionIds }) {
      const r = await polls.vote(ctx.userId, pollId, optionIds);
      return {
        data: { pollId: r.pollId, counts: r.counts, myVote: r.myVote, closedAt: r.closedAt },
        after: () => ctx.broadcast.toUsers(r.memberIds, S2C.POLL_UPDATED, { pollId: r.pollId, counts: r.counts, closedAt: r.closedAt }, { except: ctx.socket }),
      };
    },
  },
  {
    type: C2S.POLL_CLOSE, schema: v.pollIdPayload,
    async run(ctx, { pollId }) {
      const r = await polls.closePoll(ctx.userId, pollId);
      const payload = { pollId: r.pollId, counts: r.counts, closedAt: r.closedAt };
      // Everyone, the closer's own socket included: the frontend relies on the event to show "closed".
      return { data: payload, after: () => ctx.broadcast.toUsers(r.memberIds, S2C.POLL_UPDATED, payload) };
    },
  },
];
