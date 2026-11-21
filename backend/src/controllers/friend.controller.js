import * as friends from '../services/friend.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const noContent = (res) => res.status(204).end();
export const list = asyncHandler(async (req, res) => res.json({ data: await friends.listFriends(req.user.id) }));
export const requests = asyncHandler(async (req, res) => res.json({ data: await friends.listRequests(req.user.id) }));
export const sendRequest = asyncHandler(async (req, res) => res.status(201).json({ data: await friends.sendRequest(req.user.id, req.valid.body.userId) }));
export const accept = asyncHandler(async (req, res) => res.json({ data: await friends.acceptRequest(req.user.id, req.valid.params.userId) }));
export const decline = asyncHandler(async (req, res) => { await friends.declineRequest(req.user.id, req.valid.params.userId); noContent(res); });
export const remove = asyncHandler(async (req, res) => { await friends.removeFriend(req.user.id, req.valid.params.userId); noContent(res); });
export const block = asyncHandler(async (req, res) => { await friends.blockUser(req.user.id, req.valid.params.userId); noContent(res); });
export const unblock = asyncHandler(async (req, res) => { await friends.unblockUser(req.user.id, req.valid.params.userId); noContent(res); });
