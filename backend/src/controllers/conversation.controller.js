import * as conversations from '../services/conversation.service.js';
import * as messages from '../services/message.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const meta = ({ hasMore, nextCursor }) => ({ hasMore, nextCursor });

export const list = asyncHandler(async (req, res) => {
  const r = await conversations.list(req.user.id, req.valid.query);
  res.json({ data: r.items, meta: meta(r) });
});
export const create = asyncHandler(async (req, res) => {
  const b = req.valid.body;
  if (b.type === 'direct') {
    const { conversation, created } = await conversations.createDirect(req.user.id, b.userId);
    return res.status(created ? 201 : 200).json({ data: conversation });
  }
  return res.status(201).json({ data: await conversations.createGroup(req.user.id, b) });
});
export const get = asyncHandler(async (req, res) => res.json({ data: await conversations.get(req.user.id, req.valid.params.id) }));
export const update = asyncHandler(async (req, res) => res.json({ data: await conversations.updateGroup(req.user.id, req.valid.params.id, req.valid.body) }));
export const addMembers = asyncHandler(async (req, res) => res.json({ data: await conversations.addMembers(req.user.id, req.valid.params.id, req.valid.body.userIds) }));
export const removeMember = asyncHandler(async (req, res) => {
  await conversations.removeMember(req.user.id, req.valid.params.id, req.valid.params.userId);
  res.status(204).end();
});
export const mute = asyncHandler(async (req, res) => res.json({ data: await conversations.setMute(req.user.id, req.valid.params.id, req.valid.body.mutedUntil) }));

export const markRead = asyncHandler(async (req, res) => {
  const r = await messages.markRead(req.user.id, req.valid.params.id, req.valid.body.messageId);
  res.json({ data: { lastReadMessageId: r.lastReadMessageId } });
});
export const readState = asyncHandler(async (req, res) => res.json({ data: await messages.readState(req.user.id, req.valid.params.id) }));
export const listMessages = asyncHandler(async (req, res) => {
  const r = await messages.listMessages(req.user.id, req.valid.params.id, req.valid.query);
  res.json({ data: r.items, meta: meta(r) });
});
export const getMessage = asyncHandler(async (req, res) => res.json({ data: await messages.getMessage(req.user.id, req.valid.params.id, req.valid.params.messageId) }));
