import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { createEventBus } from '../eventBus.js';
import { registerMessageHandlers } from './messages.js';
import { queryKeys } from '../../api/queryKeys.js';
import { selectMessages } from '../../features/messages/cache.js';
import { flattenConversations } from '../../features/conversations/cache.js';

const U = (id) => ({ id, username: id, displayName: id, avatarUrl: null });
const conv = (id, extra = {}) => ({ id, type: 'direct', members: [{ user: U('me'), role: 'member' }, { user: U('u2'), role: 'member' }], lastMessage: null, unreadCount: 0, updatedAt: '2026-11-17T10:00:00Z', ...extra });
const msg = (id, extra = {}) => ({ id, conversationId: 'c1', senderId: 'u2', type: 'text', text: id, attachments: [], reactions: [], replyTo: null, editedAt: null, deletedAt: null, createdAt: '2026-11-17T10:05:00Z', ...extra });

let qc; let bus; let active; let offs;
beforeEach(() => {
  vi.useFakeTimers();
  qc = new QueryClient(); bus = createEventBus(); active = null;
  qc.setQueryData(queryKeys.conversations.list(''), { pages: [{ data: [conv('c1'), conv('c2', { updatedAt: '2026-11-17T09:00:00Z' })], meta: {} }], pageParams: [undefined] });
  qc.setQueryData(queryKeys.conversations.messages('c1'), { pages: [{ data: [msg('m1')], meta: {} }], pageParams: [undefined] });
  offs = registerMessageHandlers(bus, qc, { getMeId: () => 'me', getActiveConversationId: () => active });
});
afterEach(() => { offs.forEach((o) => o()); vi.useRealTimers(); });

const msgs = () => selectMessages(qc.getQueryData(queryKeys.conversations.messages('c1')));
const lists = () => flattenConversations(qc.getQueryData(queryKeys.conversations.list('')));

describe('message socket handlers', () => {
  it('MESSAGE_NEW lands in the message cache and updates lastMessage; order moves the conversation up', () => {
    bus.emit('MESSAGE_NEW', { message: msg('m2', { text: 'hello there', conversationId: 'c2', createdAt: '2026-11-17T12:00:00Z' }) });
    bus.emit('MESSAGE_NEW', { message: msg('m2') });
    expect(msgs().map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(lists()[0].id).toBe('c2');
    expect(lists()[0].lastMessage).toMatchObject({ preview: 'hello there', senderId: 'u2' });
  });

  it('is idempotent: the same MESSAGE_NEW twice does not duplicate', () => {
    bus.emit('MESSAGE_NEW', { message: msg('m2') }); bus.emit('MESSAGE_NEW', { message: msg('m2') });
    expect(msgs()).toHaveLength(2);
  });

  it('a message from someone else while not viewing schedules ONE debounced list refetch; while viewing it does not', () => {
    const spy = vi.spyOn(qc, 'invalidateQueries');
    bus.emit('MESSAGE_NEW', { message: msg('m2') }); bus.emit('MESSAGE_NEW', { message: msg('m3') });
    vi.advanceTimersByTime(1100);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockClear();
    active = 'c1';
    bus.emit('MESSAGE_NEW', { message: msg('m4') });
    vi.advanceTimersByTime(1100);
    expect(spy).not.toHaveBeenCalled();
  });

  it('own message from another tab does not trigger a refetch; an unknown conversation does', () => {
    const spy = vi.spyOn(qc, 'invalidateQueries');
    bus.emit('MESSAGE_NEW', { message: msg('m2', { senderId: 'me' }) });
    vi.advanceTimersByTime(1100);
    expect(spy).not.toHaveBeenCalled();
    bus.emit('MESSAGE_NEW', { message: msg('x1', { conversationId: 'brand-new' }) });
    vi.advanceTimersByTime(1100);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('edit, delete and reaction events patch the right message', () => {
    bus.emit('MESSAGE_EDITED', { conversationId: 'c1', messageId: 'm1', text: 'fixed', editedAt: '2026-11-17T10:10:00Z' });
    expect(msgs()[0]).toMatchObject({ text: 'fixed', editedAt: '2026-11-17T10:10:00Z' });
    bus.emit('MESSAGE_REACTION_UPDATED', { conversationId: 'c1', messageId: 'm1', reactions: [{ emoji: '🔥', userIds: ['u2'] }] });
    expect(msgs()[0].reactions).toEqual([{ emoji: '🔥', userIds: ['u2'] }]);
    bus.emit('MESSAGE_DELETED', { conversationId: 'c1', messageId: 'm1', deletedAt: '2026-11-17T10:20:00Z' });
    expect(msgs()[0]).toMatchObject({ text: '', deletedAt: '2026-11-17T10:20:00Z', reactions: [] });
  });

  it('events for conversations that are not cached are ignored without error', () => {
    expect(() => bus.emit('MESSAGE_EDITED', { conversationId: 'zzz', messageId: 'm1', text: 'x', editedAt: 'y' })).not.toThrow();
    expect(qc.getQueryData(queryKeys.conversations.messages('zzz'))).toBeUndefined();
  });

  it('CONVERSATION_UPDATED replaces fields (server unread wins) and inserts new conversations; REMOVED deletes', () => {
    bus.emit('CONVERSATION_UPDATED', { conversation: conv('c1', { unreadCount: 4, updatedAt: '2026-11-17T13:00:00Z' }) });
    expect(lists()[0]).toMatchObject({ id: 'c1', unreadCount: 4 });
    bus.emit('CONVERSATION_UPDATED', { conversation: conv('c3', { updatedAt: '2026-11-17T14:00:00Z' }) });
    expect(lists().map((c) => c.id)).toEqual(['c3', 'c1', 'c2']);
    bus.emit('CONVERSATION_REMOVED', { conversationId: 'c3' });
    expect(lists().map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('MESSAGE_READ_UPDATED updates read-state; my own read from another device zeroes unread', () => {
    qc.setQueryData(queryKeys.conversations.readState('c1'), [{ userId: 'u2', lastReadMessageId: 'm0' }]);
    bus.emit('MESSAGE_READ_UPDATED', { conversationId: 'c1', userId: 'u2', lastReadMessageId: 'm1' });
    expect(qc.getQueryData(queryKeys.conversations.readState('c1'))).toEqual([{ userId: 'u2', lastReadMessageId: 'm1' }]);
    qc.setQueryData(queryKeys.conversations.list(''), (d) => ({ ...d, pages: [{ ...d.pages[0], data: d.pages[0].data.map((c) => (c.id === 'c1' ? { ...c, unreadCount: 3 } : c)) }] }));
    bus.emit('MESSAGE_READ_UPDATED', { conversationId: 'c1', userId: 'me', lastReadMessageId: 'm1' });
    expect(lists().find((c) => c.id === 'c1').unreadCount).toBe(0);
  });
});
