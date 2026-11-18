import { describe, it, expect } from 'vitest';
import { flattenConversations, patchConversation, removeConversation, totalUnread, upsertConversation } from './cache.js';
import { conversationSubtitle, conversationTitle, myRole, previewLine } from './utils.js';
import { formatDayLabel, formatListTime } from '../../utils/time.js';

const U = (id, name) => ({ id, username: name.toLowerCase(), displayName: `${name} Test`, avatarUrl: null });
const conv = (id, updatedAt, extra = {}) => ({ id, type: 'direct', title: null, members: [{ user: U('me', 'Me'), role: 'member' }, { user: U('u2', 'Meera'), role: 'member' }], lastMessage: null, unreadCount: 0, updatedAt, ...extra });
const list = (...items) => ({ pages: [{ data: items, meta: {} }], pageParams: [undefined] });

describe('conversation cache', () => {
  it('inserts a new conversation at the top only when insert is true', () => {
    const d = list(conv('a', '2026-11-17T10:00:00Z'));
    const n = conv('b', '2026-11-17T11:00:00Z');
    expect(flattenConversations(upsertConversation(d, n, { insert: true })).map((c) => c.id)).toEqual(['b', 'a']);
    expect(flattenConversations(upsertConversation(d, n, { insert: false })).map((c) => c.id)).toEqual(['a']);
  });
  it('moves an updated conversation to the top', () => {
    const d = list(conv('a', '2026-11-17T10:00:00Z'), conv('b', '2026-11-17T09:00:00Z'));
    const up = upsertConversation(d, { id: 'b', updatedAt: '2026-11-17T12:00:00Z', unreadCount: 2 }, { insert: true });
    expect(flattenConversations(up).map((c) => [c.id, c.unreadCount])).toEqual([['b', 2], ['a', 0]]);
  });
  it('remove, patch and unread totals (muted conversations do not count)', () => {
    const d = list(conv('a', '2026-11-17T10:00:00Z', { unreadCount: 3 }), conv('b', '2026-11-17T09:00:00Z', { unreadCount: 2, mutedUntil: '2999-01-01T00:00:00Z' }));
    expect(totalUnread(d)).toBe(3);
    expect(flattenConversations(removeConversation(d, 'a')).map((c) => c.id)).toEqual(['b']);
    expect(flattenConversations(patchConversation(d, 'a', { unreadCount: 0 }))[0].unreadCount).toBe(0);
    expect(totalUnread(undefined)).toBe(0);
  });
});

describe('conversation utils', () => {
  const direct = conv('a', 'x', { lastMessage: { senderId: 'u2', preview: 'send the notes', type: 'text', at: 'x' } });
  const group = { ...direct, type: 'group', title: 'Thesis crew', lastMessage: { senderId: 'u2', preview: 'poll is up', type: 'text', at: 'x' } };
  it('titles and subtitles', () => {
    expect(conversationTitle(direct, 'me')).toBe('Meera Test');
    expect(conversationTitle(group, 'me')).toBe('Thesis crew');
    expect(conversationSubtitle(direct, 'me')).toBe('@meera');
    expect(conversationSubtitle(group, 'me')).toBe('2 members');
  });
  it('preview prefixes', () => {
    expect(previewLine(direct, 'me')).toBe('send the notes');
    expect(previewLine(group, 'me')).toBe('Meera: poll is up');
    expect(previewLine({ ...direct, lastMessage: { senderId: 'me', preview: 'ok', type: 'text' } }, 'me')).toBe('you: ok');
    expect(previewLine({ ...direct, lastMessage: { senderId: 'u2', preview: '', type: 'image' } }, 'me')).toBe('Image');
    expect(previewLine({ ...direct, lastMessage: null }, 'me')).toBe('No messages yet');
  });
  it('role defaults to member', () => {
    expect(myRole({ members: [{ user: U('me', 'Me'), role: 'owner' }] }, 'me')).toBe('owner');
    expect(myRole({ members: [] }, 'me')).toBe('member');
  });
});

describe('time formatting', () => {
  const now = new Date(2026, 10, 17, 18, 0);
  it('list time', () => {
    expect(formatListTime(new Date(2026, 10, 17, 9, 5).toISOString(), now)).toBe('09:05');
    expect(formatListTime(new Date(2026, 10, 14, 9, 5).toISOString(), now)).toMatch(/^[A-Z][a-z]{2}$/);
    expect(formatListTime(new Date(2026, 9, 1, 9, 5).toISOString(), now)).toBe('1 Oct');
    expect(formatListTime(null, now)).toBe('');
  });
  it('day labels', () => {
    expect(formatDayLabel(new Date(2026, 10, 17, 1).toISOString(), now)).toBe('Today');
    expect(formatDayLabel(new Date(2026, 10, 16, 23).toISOString(), now)).toBe('Yesterday');
    expect(formatDayLabel(new Date(2025, 11, 3).toISOString(), now)).toContain('2025');
  });
});
