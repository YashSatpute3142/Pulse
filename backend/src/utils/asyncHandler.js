// Express 5 already forwards rejected promises; this keeps handlers explicit and works on any Express version.
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
