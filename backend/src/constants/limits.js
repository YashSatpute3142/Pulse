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
  ACTIVITY_LABEL_MAX: 60,
  ACTIVITY_MAX_EXPIRES_MIN: 24 * 60,
  ROOM_MAX_INVITES: 20,
  ROOM_MAX_PARTICIPANTS: 20, // provisional default, not in the contract
  ROOM_MAX_OPEN_HOSTED: 3,   // provisional default: open (lobby/running) rooms one user may host
  ROOM_MESSAGE_MAX: 500,
  POLL_MAX_CLOSE_MIN: 7 * 24 * 60,
  REFRESH_COOKIE_NAME: 'pulse_rt',
});
