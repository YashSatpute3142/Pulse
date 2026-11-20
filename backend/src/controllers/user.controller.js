import * as userService from '../services/user.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { readRefreshCookie } from './cookies.js';

export const search = asyncHandler(async (req, res) => res.json({ data: await userService.search(req.user.id, req.valid.query.q) }));
export const getProfile = asyncHandler(async (req, res) => res.json({ data: await userService.getProfile(req.user.id, req.valid.params.id) }));
export const updateProfile = asyncHandler(async (req, res) => res.json({ data: await userService.updateProfile(req.user.id, req.valid.body) }));
export const updateSettings = asyncHandler(async (req, res) => res.json({ data: await userService.updateSettings(req.user.id, req.valid.body) }));
export const changePassword = asyncHandler(async (req, res) => {
  await userService.changePassword(req.user.id, req.valid.body, readRefreshCookie(req));
  res.status(204).end();
});
