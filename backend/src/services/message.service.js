import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { isValidId, toObjectId } from '../utils/ids.js';
import { toMessage, previewText } from '../utils/serializers.js';
import { events, EVENTS } from '../utils/events.js';
import { LIMITS } from '../constants/limits.js';
import { loadConversationForMember, myMembership, isAdminRole, areFriends, getRelation } from './access.service.js';
import { verifyAttachments, destroyAttachments } from './attachment.service.js';

const MAX_TEXT = 4000;
const MAX_REACTIONS = 20; // distinct emoji per message (DATABASE_SCHEMA principle 1)
const activeIds = (conv) => conv.members.filter((m) => !m.leftAt).map((m) => String(m.user));

async function replyPreviewMap(messages) {
  const ids = [...new Set(messages.map((m) => m.replyTo).filter(Boolean).map(String))];
  if (!ids.length) return new Map();
  const rows = await Message.find({ _id: { $in: ids } }).select('senderId text type deletedAt').lean();
  return new Map(rows.map((r) => [String(r._id), r]));
}
const serializeMany = async (messages) => { const map = await replyPreviewMap(messages); return messages.map((m) => toMessage(m, map)); };

// ---------------------------------------------------------------------------------------------------------------------
// History (HTTP, API_CONTRACT 4.5)
// ---------------------------------------------------------------------------------------------------------------------

/** Newest first. `before` is a message id (cursor). */
export async function listMessages(actorId, conversationId, { before, limit = 30 } = {}) {
  await loadConversationForMember(conversationId, actorId);
  if (before && !isValidId(before)) throw ApiError.validation('Invalid cursor.', { before: 'Invalid cursor.' });
  const filter = { conversationId };
  if (before) filter._id = { $lt: before };
  const rows = await Message.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { items: await serializeMany(page), hasMore, nextCursor: hasMore ? String(page[page.length - 1]._id) : null };
}

export async function getMessage(actorId, conversationId, messageId) {
  await loadConversationForMember(conversationId, actorId);
  if (!isValidId(String(messageId))) throw ApiError.notFound('Message not found.');
  const m = await Message.findOne({ _id: messageId, conversationId }).lean();
  if (!m) throw ApiError.notFound('Message not found.');
  return (await serializeMany([m]))[0];
}

/** Seen-by data: members' read pointers, hiding users who turned read receipts off (their own entry is still returned to them). */
export async function readState(actorId, conversationId) {
  const conv = await loadConversationForMember(conversationId, actorId);
  const members = conv.members.filter((m) => !m.leftAt);
  const users = await User.find({ _id: { $in: members.map((m) => m.user) } }).select('settings.showReadReceipts').lean();
  const shows = new Map(users.map((u) => [String(u._id), u.settings?.showReadReceipts !== false]));
  return members
    .filter((m) => String(m.user) === String(actorId) || shows.get(String(m.user)))
    .map((m) => ({ userId: String(m.user), lastReadMessageId: m.lastReadMessageId ? String(m.lastReadMessageId) : null }));
}

// ---------------------------------------------------------------------------------------------------------------------
// Read pointer (HTTP + WS MESSAGE_READ)
// ---------------------------------------------------------------------------------------------------------------------

export async function markRead(actorId, conversationId, messageId) {
  await loadConversationForMember(conversationId, actorId);
  if (!isValidId(String(messageId))) throw ApiError.validation('Invalid message.', { messageId: 'Invalid message.' });
  const msg = await Message.findOne({ _id: messageId, conversationId }).select('_id').lean();
  if (!msg) throw ApiError.notFound('Message not found.');

  const me = toObjectId(actorId);
  // Atomic and monotonic: the pointer only moves forward (ObjectIds are time-ordered), so late or duplicate calls are harmless.
  const res = await Conversation.updateOne(
    { _id: conversationId },
    { $set: { 'members.$[m].lastReadMessageId': msg._id, 'members.$[m].lastReadAt': new Date(), 'members.$[m].unreadCount': 0 } },
    { arrayFilters: [{ $and: [{ 'm.user': me }, { 'm.leftAt': null }, { $or: [{ 'm.lastReadMessageId': null }, { 'm.lastReadMessageId': { $lt: msg._id } }] }] }], timestamps: false },
  );
  const advanced = res.modifiedCount > 0;
  if (advanced) events.emit(EVENTS.MESSAGE_READ, { conversationId: String(conversationId), userId: String(actorId), lastReadMessageId: String(msg._id) });
  return { advanced, lastReadMessageId: String(msg._id) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Writes (called by WS handlers, Chat 04). Handlers broadcast the returned value; these functions do not emit.
// ---------------------------------------------------------------------------------------------------------------------

export async function assertCanPost(conv, actorId) {
  if (conv.type !== 'direct') return;
  const otherId = conv.members.find((m) => String(m.user) !== String(actorId))?.user;
  const rel = otherId ? await getRelation(actorId, otherId) : null;
  if (rel?.status === 'blocked') throw ApiError.forbidden('You cannot message this user.');
  if (!(await areFriends(actorId, otherId))) throw ApiError.forbidden('You can only message friends.');
}

function previewFor(type, text) {
  if (type === 'image') return text ? previewText(text) : 'Photo';
  if (type === 'file') return text ? previewText(text) : 'Document';
  return previewText(text);
}

/**
 * CHAT_MESSAGE. Idempotent on (conversationId, clientId): a retry returns the original message with duplicate: true.
 * @returns {{ message, memberIds: string[], duplicate: boolean }}
 */
export async function sendMessage(actorId, { conversationId, clientId, text = '', attachments = [], replyTo = null }) {
  const conv = await loadConversationForMember(conversationId, actorId);
  await assertCanPost(conv, actorId);

  const body = String(text ?? '').trim();
  if (body.length > MAX_TEXT) throw ApiError.validation(`Messages can be at most ${MAX_TEXT} characters.`, { text: 'Too long.' });
  if (!body && !attachments?.length) throw ApiError.validation('Write a message or attach a file.', { text: 'Required.' });
  if (attachments && attachments.length > 5) throw ApiError.validation('At most 5 attachments per message.', { attachments: 'Too many.' });
  if (clientId !== undefined && (typeof clientId !== 'string' || clientId.length < 8 || clientId.length > 64)) {
    throw ApiError.validation('Invalid clientId.', { clientId: 'Invalid.' });
  }

  const memberIds = activeIds(conv);

  if (clientId) { // fast path for retries
    const dup = await Message.findOne({ conversationId, senderId: actorId, clientId }).lean();
    if (dup) return { message: (await serializeMany([dup]))[0], memberIds, duplicate: true };
  }

  if (replyTo) {
    const target = isValidId(String(replyTo)) ? await Message.exists({ _id: replyTo, conversationId }) : null;
    if (!target) throw ApiError.validation('The message you are replying to was not found.', { replyTo: 'Not found.' });
  }

  const verified = verifyAttachments(actorId, attachments);
  const type = verified.length ? (verified.every((a) => a.kind === 'image') ? 'image' : 'file') : 'text';

  let doc;
  try {
    doc = await Message.create({
      conversationId, senderId: actorId, type, text: body, attachments: verified,
      replyTo: replyTo || null, ...(clientId ? { clientId } : {}),
    });
  } catch (err) {
    if (err?.code === 11000 && clientId) { // two identical sends raced: the loser returns the winner
      const winner = await Message.findOne({ conversationId, senderId: actorId, clientId }).lean();
      if (winner) return { message: (await serializeMany([winner]))[0], memberIds, duplicate: true };
      // The unique index is (conversationId, clientId) per DATABASE_SCHEMA: another member already used this clientId.
      throw ApiError.conflict('clientId already used in this conversation.', { clientId: 'Already used.' });
    }
    throw err;
  }

  await commitMessage(doc, actorId, previewFor(type, body));

  return { message: (await serializeMany([doc.toObject()]))[0], memberIds, duplicate: false };
}

/**
 * Shared tail of every "new message" write: one atomic update sets lastMessage, bumps updatedAt and increments unread for every
 * ACTIVE member except the sender (schema 3.4). Used by sendMessage and poll.service (poll messages).
 */
export async function commitMessage(doc, actorId, preview) {
  await Conversation.updateOne(
    { _id: doc.conversationId },
    {
      $inc: { 'members.$[o].unreadCount': 1 },
      $set: { lastMessage: { messageId: doc._id, senderId: toObjectId(actorId), preview, type: doc.type, at: doc.createdAt }, updatedAt: doc.createdAt },
    },
    { arrayFilters: [{ 'o.user': { $ne: toObjectId(actorId) }, 'o.leftAt': null }], timestamps: false },
  );
}

export const serializeMessages = serializeMany;
export const activeMemberIds = activeIds;

/** MESSAGE_EDIT: sender only, text messages only, within 24 hours. */
export async function editMessage(actorId, messageId, text) {
  const msg = isValidId(String(messageId)) ? await Message.findById(messageId) : null;
  if (!msg) throw ApiError.notFound('Message not found.');
  const conv = await loadConversationForMember(msg.conversationId, actorId);
  if (String(msg.senderId) !== String(actorId)) throw ApiError.forbidden('You can only edit your own messages.');
  if (msg.deletedAt) throw ApiError.notFound('Message not found.');
  if (msg.type !== 'text') throw ApiError.validation('Only text messages can be edited.');
  if (Date.now() - msg.createdAt.getTime() > LIMITS.MESSAGE_EDIT_WINDOW_MS) throw ApiError.forbidden('Messages can only be edited within 24 hours.');
  const body = String(text ?? '').trim();
  if (!body || body.length > MAX_TEXT) throw ApiError.validation(`Messages must be 1 to ${MAX_TEXT} characters.`, { text: 'Invalid length.' });

  msg.text = body;
  msg.editedAt = new Date();
  await msg.save();
  await Conversation.updateOne({ _id: conv._id, 'lastMessage.messageId': msg._id }, { $set: { 'lastMessage.preview': previewText(body) } }, { timestamps: false });
  return { conversationId: String(conv._id), messageId: String(msg._id), text: body, editedAt: msg.editedAt, memberIds: activeIds(conv) };
}

/** MESSAGE_DELETE: sender, or group admin/owner. Soft delete: content blanked, files removed from storage. Idempotent. */
export async function deleteMessage(actorId, messageId) {
  const msg = isValidId(String(messageId)) ? await Message.findById(messageId) : null;
  if (!msg) throw ApiError.notFound('Message not found.');
  const conv = await loadConversationForMember(msg.conversationId, actorId);
  const isSender = String(msg.senderId) === String(actorId);
  const canModerate = conv.type === 'group' && isAdminRole(myMembership(conv, actorId));
  if (!isSender && !canModerate) throw ApiError.forbidden('You cannot delete this message.');
  if (msg.deletedAt) return { conversationId: String(conv._id), messageId: String(msg._id), deletedAt: msg.deletedAt, memberIds: activeIds(conv) };

  const files = msg.attachments.map((a) => ({ publicId: a.publicId, kind: a.kind }));
  msg.deletedAt = new Date();
  msg.text = '';
  msg.attachments = [];
  await msg.save();
  await Conversation.updateOne({ _id: conv._id, 'lastMessage.messageId': msg._id }, { $set: { 'lastMessage.preview': 'Message deleted' } }, { timestamps: false });
  await destroyAttachments(files);
  return { conversationId: String(conv._id), messageId: String(msg._id), deletedAt: msg.deletedAt, memberIds: activeIds(conv) };
}

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
export function isSingleEmoji(s) {
  if (typeof s !== 'string' || !s || s.length > 16) return false;
  const parts = [...segmenter.segment(s)];
  return parts.length === 1 && /\p{Extended_Pictographic}|\p{Regional_Indicator}|^[#*0-9]️?⃣$/u.test(s);
}

/** MESSAGE_REACTION add/remove. One user, one entry per emoji; <= 20 distinct emoji per message. */
export async function setReaction(actorId, messageId, emoji, action) {
  if (!isSingleEmoji(emoji)) throw ApiError.validation('Use a single emoji.', { emoji: 'Invalid emoji.' });
  if (action !== 'add' && action !== 'remove') throw ApiError.validation('Invalid action.', { action: 'Invalid.' });
  const msg = isValidId(String(messageId)) ? await Message.findById(messageId).select('conversationId deletedAt').lean() : null;
  if (!msg || msg.deletedAt) throw ApiError.notFound('Message not found.');
  const conv = await loadConversationForMember(msg.conversationId, actorId);
  const me = toObjectId(actorId);

  if (action === 'add') {
    const addToExisting = () => Message.updateOne({ _id: messageId, 'reactions.emoji': emoji }, { $addToSet: { 'reactions.$.users': me } });
    let res = await addToExisting();
    if (res.matchedCount === 0) {
      const pushed = await Message.updateOne(
        { _id: messageId, 'reactions.emoji': { $ne: emoji }, [`reactions.${MAX_REACTIONS - 1}`]: { $exists: false } },
        { $push: { reactions: { emoji, users: [me] } } },
      );
      if (pushed.matchedCount === 0) {
        res = await addToExisting(); // someone else added this emoji between the two statements
        if (res.matchedCount === 0) throw ApiError.validation(`At most ${MAX_REACTIONS} different reactions per message.`, { emoji: 'Too many reactions.' });
      }
    }
  } else {
    await Message.updateOne({ _id: messageId, 'reactions.emoji': emoji }, { $pull: { 'reactions.$.users': me } });
    await Message.updateOne({ _id: messageId }, { $pull: { reactions: { emoji, users: { $size: 0 } } } });
  }
  const fresh = await Message.findById(messageId).select('reactions').lean();
  return {
    conversationId: String(conv._id), messageId: String(messageId), memberIds: activeIds(conv),
    reactions: (fresh.reactions || []).map((r) => ({ emoji: r.emoji, userIds: r.users.map(String) })),
  };
}

