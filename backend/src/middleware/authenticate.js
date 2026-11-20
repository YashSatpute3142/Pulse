import { ApiError } from '../utils/ApiError.js';
import { verifyAccessToken } from '../services/token.service.js';
import { User } from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** Verifies the access JWT and that the account is still valid (tokenVersion, not disabled). Sets req.user = { id }. */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw ApiError.unauthenticated();

  const claims = verifyAccessToken(token); // throws UNAUTHENTICATED
  const user = await User.findById(claims.sub).select('tokenVersion disabledAt').lean();
  if (!user || user.disabledAt || user.tokenVersion !== claims.tv) throw ApiError.unauthenticated('Session expired.');

  req.user = { id: String(user._id) };
  next();
});
