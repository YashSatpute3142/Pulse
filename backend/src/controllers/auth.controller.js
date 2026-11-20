import * as authService from '../services/auth.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { setRefreshCookie, clearRefreshCookie, readRefreshCookie } from './cookies.js';

const meta = (req) => ({ userAgent: req.headers['user-agent'] || '', ip: req.ip || '' });

function sendSession(res, status, { user, accessToken, refreshToken }) {
  setRefreshCookie(res, refreshToken);
  res.status(status).json({ data: { user, accessToken } });
}

export const register = asyncHandler(async (req, res) => sendSession(res, 201, await authService.register(req.valid.body, meta(req))));
export const login = asyncHandler(async (req, res) => sendSession(res, 200, await authService.login(req.valid.body, meta(req))));

export const refresh = asyncHandler(async (req, res) => {
  try {
    sendSession(res, 200, await authService.refresh(readRefreshCookie(req), meta(req)));
  } catch (err) {
    if (err?.status === 401) clearRefreshCookie(res); // a rejected refresh cookie is dead; do not keep sending it
    throw err;
  }
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout(readRefreshCookie(req));
  clearRefreshCookie(res);
  res.status(204).end();
});

export const me = asyncHandler(async (req, res) => res.json({ data: await authService.me(req.user.id) }));
export const wsTicket = asyncHandler(async (req, res) => res.json({ data: authService.wsTicket(req.user.id) }));
