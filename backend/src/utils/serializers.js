// Shapes from API_CONTRACT Section 3. IDs are strings, dates are ISO strings (Date -> JSON does this).
const id = (v) => String(v);

export function toUser(u) {
  return {
    id: id(u._id),
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl ?? null,
    bio: u.bio ?? '',
    createdAt: u.createdAt,
  };
}

export function toMe(u) {
  const s = u.settings || {};
  return {
    ...toUser(u),
    email: u.email,
    settings: {
      theme: s.theme ?? 'system',
      activityVisibility: s.activityVisibility ?? 'friends',
      showPresence: s.showPresence ?? true,
      showReadReceipts: s.showReadReceipts ?? true,
    },
  };
}
