import { Poll } from '../models/Poll.js';
import { Message } from '../models/Message.js';
import { ApiError } from '../utils/ApiError.js';
import { isValidId, toObjectId } from '../utils/ids.js';
import { previewText } from '../utils/serializers.js';
import { LIMITS } from '../constants/limits.js';
import { loadConversationForMember } from './access.service.js';
import { assertCanPost, commitMessage, serializeMessages, activeMemberIds } from './message.service.js';

// Polls (API_CONTRACT 4.9, WEBSOCKET_PROTOCOL POLL_*). Reads are HTTP; create/vote/close are called by WS handlers, which broadcast.
// Voters are never serialized: anonymous polls cannot leak them, and non-anonymous polls only expose counts and the caller's own vote.

const effectiveClosedAt = (p, now = new Date()) => p.closedAt ?? (p.closesAt && p.closesAt <= now ? p.closesAt : null);

function countsOf(p) {
  const counts = Object.fromEntries(p.options.map((o) => [o.id, 0]));
  for (const v of p.votes || []) for (const id of new Set(v.optionIds)) if (id in counts) counts[id] += 1;
  return counts;
}

export function toPoll(p, viewerId) {
  const mine = (p.votes || []).find((v) => String(v.user) === String(viewerId));
  return {
    id: String(p._id), conversationId: String(p.conversationId), messageId: p.messageId ? String(p.messageId) : null, creatorId: String(p.creatorId),
    question: p.question, options: p.options.map((o) => ({ id: o.id, text: o.text })), multiple: !!p.multiple, anonymous: !!p.anonymous,
    closesAt: p.closesAt ?? null, closedAt: effectiveClosedAt(p), counts: countsOf(p), myVote: mine ? [...mine.optionIds] : [],
  };
}

/** GET /polls/:id. Members of the poll's conversation only; everyone else (including unknown ids) gets 404. */
export async function getPoll(userId, pollId) {
  if (!isValidId(String(pollId))) throw ApiError.notFound('Poll not found.');
  const p = await Poll.findById(pollId).lean();
  if (!p) throw ApiError.notFound('Poll not found.');
  await loadConversationForMember(p.conversationId, userId);
  return toPoll(p, userId);
}

/** POLL_CREATE: creates the poll and its chat message together. @returns {{ poll, message, memberIds }} (broadcast POLL_CREATED to memberIds) */
export async function createPoll(actorId, { conversationId, question, options, multiple = false, anonymous = false, closesInMin } = {}) {
  const conv = await loadConversationForMember(conversationId, actorId);
  await assertCanPost(conv, actorId);
  const q = String(question ?? '').trim();
  if (!q || q.length > 200) throw ApiError.validation('The question must be 1 to 200 characters.', { question: 'Invalid length.' });
  if (!Array.isArray(options)) throw ApiError.validation('Provide 2 to 8 options.', { options: 'Required.' });
  const texts = options.map((o) => (typeof o === 'string' ? o.trim() : ''));
  if (texts.length < 2 || texts.length > 8) throw ApiError.validation('Provide 2 to 8 options.', { options: '2 to 8 options.' });
  if (texts.some((t) => !t || t.length > 80)) throw ApiError.validation('Each option must be 1 to 80 characters.', { options: 'Invalid option.' });
  if (new Set(texts.map((t) => t.toLowerCase())).size !== texts.length) throw ApiError.validation('Options must be different.', { options: 'Duplicate option.' });
  if (typeof multiple !== 'boolean' || typeof anonymous !== 'boolean') throw ApiError.validation('Invalid poll settings.');
  if (closesInMin != null && !(Number.isInteger(closesInMin) && closesInMin >= 1 && closesInMin <= LIMITS.POLL_MAX_CLOSE_MIN)) {
    throw ApiError.validation('Invalid closing time.', { closesInMin: `1 to ${LIMITS.POLL_MAX_CLOSE_MIN} minutes.` });
  }
  const poll = await Poll.create({
    conversationId: conv._id, creatorId: actorId, question: q, multiple, anonymous,
    options: texts.map((text, i) => ({ id: `o${i + 1}`, text })),
    closesAt: closesInMin ? new Date(Date.now() + closesInMin * 60_000) : null,
  });
  const msg = await Message.create({ conversationId: conv._id, senderId: actorId, type: 'poll', text: q, pollId: poll._id });
  poll.messageId = msg._id;
  await poll.save();
  await commitMessage(msg, actorId, previewText(`Poll: ${q}`));
  const [message] = await serializeMessages([msg.toObject()]);
  return { poll: toPoll(poll.toObject(), actorId), message, memberIds: activeMemberIds(conv) };
}

const openFilter = () => ({ closedAt: null, $or: [{ closesAt: null }, { closesAt: { $gt: new Date() } }] });

/**
 * POLL_VOTE: replaces the caller's vote; an empty array retracts it. Single-choice polls accept at most one option.
 * Atomic: one entry per user, even when the same user votes from two devices at once.
 * @returns {{ pollId, counts, closedAt, memberIds, myVote }} (broadcast POLL_UPDATED { pollId, counts, closedAt } to memberIds)
 */
export async function vote(actorId, pollId, optionIds) {
  if (!isValidId(String(pollId))) throw ApiError.notFound('Poll not found.');
  const p = await Poll.findById(pollId).lean();
  if (!p) throw ApiError.notFound('Poll not found.');
  const conv = await loadConversationForMember(p.conversationId, actorId);
  if (!Array.isArray(optionIds) || optionIds.some((x) => typeof x !== 'string')) throw ApiError.validation('Invalid vote.', { optionIds: 'Invalid.' });
  const chosen = [...new Set(optionIds)];
  const valid = new Set(p.options.map((o) => o.id));
  if (chosen.some((id) => !valid.has(id))) throw ApiError.validation('Unknown option.', { optionIds: 'Unknown option.' });
  if (!p.multiple && chosen.length > 1) throw ApiError.validation('This poll allows one choice.', { optionIds: 'Choose one.' });
  if (effectiveClosedAt(p)) throw ApiError.conflict('This poll is closed.');

  const me = toObjectId(actorId);
  let doc;
  if (chosen.length === 0) {
    doc = await Poll.findOneAndUpdate({ _id: p._id, ...openFilter() }, { $pull: { votes: { user: me } } }, { new: true }).lean();
  } else {
    for (let attempt = 0; attempt < 3 && !doc; attempt += 1) {
      doc = await Poll.findOneAndUpdate(
        { _id: p._id, ...openFilter(), 'votes.user': me },
        { $set: { 'votes.$[v].optionIds': chosen, 'votes.$[v].at': new Date() } },
        { arrayFilters: [{ 'v.user': me }], new: true },
      ).lean()
      ?? await Poll.findOneAndUpdate(
        { _id: p._id, ...openFilter(), 'votes.user': { $ne: me } },
        { $push: { votes: { user: me, optionIds: chosen, at: new Date() } } },
        { new: true },
      ).lean();
    }
  }
  if (!doc) throw ApiError.conflict('This poll is closed.');
  const out = toPoll(doc, actorId);
  return { pollId: out.id, counts: out.counts, closedAt: out.closedAt, myVote: out.myVote, memberIds: activeMemberIds(conv) };
}

/** POLL_CLOSE: creator only, idempotent. */
export async function closePoll(actorId, pollId) {
  if (!isValidId(String(pollId))) throw ApiError.notFound('Poll not found.');
  const p = await Poll.findById(pollId).lean();
  if (!p) throw ApiError.notFound('Poll not found.');
  const conv = await loadConversationForMember(p.conversationId, actorId);
  if (String(p.creatorId) !== String(actorId)) throw ApiError.forbidden('Only the creator can close this poll.');
  const doc = await Poll.findOneAndUpdate({ _id: p._id, closedAt: null }, { $set: { closedAt: new Date() } }, { new: true }).lean() ?? await Poll.findById(p._id).lean();
  const out = toPoll(doc, actorId);
  return { pollId: out.id, counts: out.counts, closedAt: out.closedAt, memberIds: activeMemberIds(conv) };
}
