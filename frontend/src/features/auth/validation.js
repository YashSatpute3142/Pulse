// Client-side checks mirror API_CONTRACT 4.1 for fast feedback only. The server is authoritative.
export function validateLogin({ identifier, password }) {
  const e = {};
  if (!identifier.trim()) e.identifier = 'Enter your email or username.';
  if (!password) e.password = 'Enter your password.';
  return e;
}

export function validateRegister({ displayName, username, email, password }) {
  const e = {};
  if (!displayName.trim()) e.displayName = 'Enter your name.';
  if (!/^[a-z0-9_]{3,24}$/.test(username.trim().toLowerCase())) e.username = 'Use 3 to 24 letters, numbers or underscores.';
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = 'Enter a valid email address.';
  if (password.length < 8 || password.length > 72) e.password = 'Use 8 to 72 characters.';
  else if (password === username.trim() || password === email.trim()) e.password = 'Password cannot match your username or email.';
  return e;
}
