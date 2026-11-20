// Provisional defaults approved by the owner (see IMPLEMENTATION_STATUS.md). Source: PROJECT_OVERVIEW.md Section 8.
export const LIMITS = Object.freeze({
  GROUP_MAX_MEMBERS: 50,
  ATTACHMENT_MAX_BYTES: 10 * 1024 * 1024,
  MESSAGE_EDIT_WINDOW_MS: 24 * 60 * 60 * 1000,
  USERNAME_MIN: 3,
  USERNAME_MAX: 24,
  PASSWORD_MIN: 8,
  PASSWORD_MAX: 72, // bcrypt only hashes the first 72 BYTES; validators also enforce the byte length
  DISPLAY_NAME_MAX: 40,
  BIO_MAX: 160,
  SEARCH_LIMIT: 20,
  REFRESH_COOKIE_NAME: 'pulse_rt',
});
