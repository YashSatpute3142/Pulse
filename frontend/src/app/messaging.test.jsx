import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { Providers } from './providers.jsx';
import { routes } from './router.jsx';
import { tokenStore } from '../api/tokenStore.js';
import { FakeWebSocket, ME, json, routeFetch, setViewport } from '../test/helpers.js';

const U = (id, name) => ({ id, username: name.toLowerCase(), displayName: `${name} Rao`, avatarUrl: null });
const meera = U('u2', 'Meera');
const conv = (id, extra = {}) => ({
  id, type: 'direct', title: null, avatarUrl: null, members: [{ user: { ...ME }, role: 'member' }, { user: meera, role: 'member' }],
  lastMessage: { messageId: 'm2', senderId: 'u2', preview: 'send the notes', type: 'text', at: new Date().toISOString() },
  unreadCount: 2, lastReadMessageId: 'm0', mutedUntil: null, updatedAt: new Date().toISOString(), ...extra,
});
const M = (id, senderId, text, extra = {}) => ({
  id, conversationId: 'c1', senderId, type: 'text', text, attachments: [], replyTo: null, pollId: null, reactions: [],
  editedAt: null, deletedAt: null, createdAt: new Date().toISOString(), ...extra,
});

function backend(extra = {}) {
  return routeFetch({
    'POST /auth/refresh': { data: { user: ME, accessToken: 'AT' } },
    'POST /auth/ws-ticket': { data: { ticket: 't', expiresInSec: 30 } },
    'GET /conversations': { data: [conv('c1'), conv('c2', { type: 'group', title: 'Thesis crew', unreadCount: 0, lastMessage: { messageId: 'x', senderId: 'u2', preview: 'poll is up', type: 'text', at: new Date().toISOString() } })], meta: { hasMore: false } },
    'GET /conversations/c1': { data: conv('c1') },
    // newest first
    'GET /conversations/c1/messages': { data: [M('m3', 'u1', 'will do', { clientId: 'old' }), M('m2', 'u2', 'send the notes'), M('m1', 'u2', 'hi')], meta: { hasMore: false } },
    'GET /conversations/c1/read-state': { data: [{ userId: 'u2', lastReadMessageId: 'm3' }] },
    'POST /conversations/c1/read': { data: null },
    'GET /activity/feed': { data: [] },
    ...extra,
  });
}

let router;
function renderAt(path) {
  router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<Providers><RouterProvider router={router} /></Providers>);
}
const socket = () => FakeWebSocket.instances.at(-1);
async function openSocket() {
  await waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0));
  act(() => socket().serverSend('READY', { userId: 'u1', serverNow: Date.now(), heartbeatSec: 30 }));
}
const sentFrames = (type) => socket().sent.filter((f) => f.type === type);

beforeEach(() => {
  tokenStore.clear(); localStorage.clear(); FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
  setViewport(1440);
});

describe('conversation list', () => {
  it('shows each conversation with title, preview prefix, unread pill and marks the open one', async () => {
    backend(); renderAt('/messages/c1');
    const list = await screen.findByRole('complementary', { name: 'Conversations' });
    const row = await within(list).findByRole('link', { name: /Meera Rao/ });
    expect(row).toHaveAttribute('aria-current', 'true');
    expect(row).toHaveTextContent('send the notes');
    expect(within(row).getByLabelText('2 unread messages')).toBeInTheDocument();
    const group = within(list).getByRole('link', { name: /Thesis crew/ });
    expect(group).toHaveTextContent('Meera: poll is up');
    expect(group).not.toHaveAttribute('aria-current');
  });

  it('shows the empty state with a link to Friends when there are no conversations', async () => {
    backend({ 'GET /conversations': { data: [], meta: { hasMore: false } } }); renderAt('/messages');
    expect(await screen.findByText('No conversations yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Find friends' })).toHaveAttribute('href', '/friends');
  });

  it('shows an error state with Retry when the inbox fails', async () => {
    backend({ 'GET /conversations': json(500, { error: { code: 'INTERNAL', message: 'boom' } }) }); renderAt('/messages');
    expect(await screen.findByText('Could not load conversations', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  }, 10000);

  it('the nav badge totals unread across conversations', async () => {
    backend(); renderAt('/');
    expect(await screen.findAllByLabelText('2 unread messages')).not.toHaveLength(0);
  });
});

describe('conversation view', () => {
  it('renders history oldest to newest with other and own messages and "Seen by 1" on my last block', async () => {
    backend(); renderAt('/messages/c1');
    const log = await screen.findByRole('log', { name: 'Messages' });
    const texts = within(log).getAllByText(/^(hi|send the notes|will do)$/).map((n) => n.textContent);
    expect(texts).toEqual(['hi', 'send the notes', 'will do']);
    expect(await within(log).findByText('Seen by 1')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Meera Rao' })).toBeInTheDocument();
  });

  it('marks the conversation read through the API when the newest message is from someone else', async () => {
    backend({ 'GET /conversations/c1/messages': { data: [M('m2', 'u2', 'send the notes'), M('m1', 'u2', 'hi')], meta: { hasMore: false } } });
    const f = routeFetch; void f;
    renderAt('/messages/c1');
    await screen.findByRole('log', { name: 'Messages' });
    await waitFor(() => expect(globalThis.fetch.mock.calls.some(([u, i]) => u.endsWith('/conversations/c1/read') && JSON.parse(i.body).messageId === 'm2')).toBe(true));
  });

  it('sends with Enter: optimistic "Sending…", correct CHAT_MESSAGE frame, ACK settles it', async () => {
    const user = userEvent.setup();
    backend(); renderAt('/messages/c1');
    await screen.findByRole('log', { name: 'Messages' });
    await openSocket();
    await user.type(screen.getByRole('textbox', { name: 'Message Meera Rao' }), 'hello from test{Enter}');
    expect(await screen.findByText('Sending…')).toBeInTheDocument();
    const [frame] = sentFrames('CHAT_MESSAGE');
    expect(frame.payload).toMatchObject({ conversationId: 'c1', text: 'hello from test' });
    expect(frame.payload.clientId).toMatch(/[0-9a-f-]{36}/);
    expect(screen.getByRole('textbox', { name: 'Message Meera Rao' })).toHaveValue('');
    act(() => socket().serverSend('ACK', { replyTo: frame.id, ok: true, data: { message: M('m9', 'u1', 'hello from test', { clientId: frame.payload.clientId }) } }));
    await waitFor(() => expect(screen.queryByText('Sending…')).toBeNull());
    expect(screen.getAllByText('hello from test')).toHaveLength(1);
  });

  it('Shift+Enter does not send', async () => {
    const user = userEvent.setup();
    backend(); renderAt('/messages/c1');
    await screen.findByRole('log', { name: 'Messages' }); await openSocket();
    await user.type(screen.getByRole('textbox', { name: 'Message Meera Rao' }), 'a{Shift>}{Enter}{/Shift}b');
    expect(sentFrames('CHAT_MESSAGE')).toHaveLength(0);
    expect(screen.getByRole('textbox', { name: 'Message Meera Rao' })).toHaveValue('a\nb');
  });

  it('queues while the socket is not open and delivers when it connects', async () => {
    const user = userEvent.setup();
    backend(); renderAt('/messages/c1');
    await screen.findByRole('log', { name: 'Messages' });
    await user.type(screen.getByRole('textbox', { name: 'Message Meera Rao' }), 'offline hi{Enter}');
    expect(await screen.findByText('Sending…')).toBeInTheDocument();
    await openSocket();
    await waitFor(() => expect(sentFrames('CHAT_MESSAGE')).toHaveLength(1));
    expect(sentFrames('CHAT_MESSAGE')[0].payload.text).toBe('offline hi');
  });

  it('shows Not delivered with Retry when the server refuses, and Retry resends the same clientId', async () => {
    const user = userEvent.setup();
    backend(); renderAt('/messages/c1');
    await screen.findByRole('log', { name: 'Messages' }); await openSocket();
    await user.type(screen.getByRole('textbox', { name: 'Message Meera Rao' }), 'nope{Enter}');
    const [first] = await waitFor(() => { const f = sentFrames('CHAT_MESSAGE'); expect(f).toHaveLength(1); return f; });
    act(() => socket().serverSend('ERROR', { replyTo: first.id, code: 'FORBIDDEN', message: 'Not a member' }));
    expect(await screen.findByText(/Not delivered/)).toHaveTextContent('Not a member');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(sentFrames('CHAT_MESSAGE')).toHaveLength(2));
    expect(sentFrames('CHAT_MESSAGE')[1].payload.clientId).toBe(first.payload.clientId);
  });

  it('shows live MESSAGE_NEW, edits and removals without a refetch', async () => {
    backend(); renderAt('/messages/c1');
    const log = await screen.findByRole('log', { name: 'Messages' });
    await openSocket();
    act(() => socket().serverSend('MESSAGE_NEW', { message: M('m4', 'u2', 'live one') }));
    expect(await within(log).findByText('live one')).toBeInTheDocument();
    act(() => socket().serverSend('MESSAGE_EDITED', { conversationId: 'c1', messageId: 'm4', text: 'live two', editedAt: new Date().toISOString() }));
    expect(await within(log).findByText('live two')).toBeInTheDocument();
    expect(within(log).getByText('edited')).toBeInTheDocument();
    act(() => socket().serverSend('MESSAGE_DELETED', { conversationId: 'c1', messageId: 'm4', deletedAt: new Date().toISOString() }));
    expect(await within(log).findByText('Message removed')).toBeInTheDocument();
  });

  it('reacts: optimistic chip, MESSAGE_REACTION frame; own reaction is pressed', async () => {
    const user = userEvent.setup();
    backend(); renderAt('/messages/c1');
    const log = await screen.findByRole('log', { name: 'Messages' }); await openSocket();
    const row = within(log).getByText('send the notes').closest('[data-msg-id]');
    await user.click(within(row).getByRole('button', { name: 'Add reaction' }));
    await user.click(within(row).getByRole('menuitem', { name: '🔥' }));
    const chip = await within(row).findByRole('button', { name: /🔥 1 reaction, including yours/ });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(sentFrames('MESSAGE_REACTION')[0].payload).toEqual({ messageId: 'm2', emoji: '🔥', action: 'add' });
  });

  it('rolls the reaction back and toasts when the server refuses', async () => {
    const user = userEvent.setup();
    backend(); renderAt('/messages/c1');
    const log = await screen.findByRole('log', { name: 'Messages' }); await openSocket();
    const row = within(log).getByText('send the notes').closest('[data-msg-id]');
    await user.click(within(row).getByRole('button', { name: 'Add reaction' }));
    await user.click(within(row).getByRole('menuitem', { name: '🔥' }));
    const frame = sentFrames('MESSAGE_REACTION')[0];
    await within(row).findByRole('button', { name: /🔥 1/ });
    act(() => socket().serverSend('ERROR', { replyTo: frame.id, code: 'RATE_LIMITED', message: 'Slow down' }));
    await waitFor(() => expect(within(row).queryByRole('button', { name: /🔥/ })).toBeNull());
    expect(await screen.findByRole('alert')).toHaveTextContent('Slow down');
  });

  it('delete asks for confirmation, then sends MESSAGE_DELETE; others\' messages cannot be deleted by a member', async () => {
    const user = userEvent.setup();
    backend(); renderAt('/messages/c1');
    const log = await screen.findByRole('log', { name: 'Messages' }); await openSocket();
    const theirs = within(log).getByText('hi').closest('[data-msg-id]');
    await user.click(within(theirs).getByRole('button', { name: 'More actions' }).closest('div') ? within(theirs).getByRole('button', { name: 'More actions' }) : theirs);
    expect(screen.queryByRole('menuitem', { name: 'Delete message' })).toBeNull();
    await user.keyboard('{Escape}');
    const mine = within(log).getByText('will do').closest('[data-msg-id]');
    await user.click(within(mine).getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete message' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this message?' });
    expect(sentFrames('MESSAGE_DELETE')).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(sentFrames('MESSAGE_DELETE')[0].payload).toEqual({ messageId: 'm3' });
    expect(await within(log).findByText('Message removed')).toBeInTheDocument();
  });

  it('reply sends replyTo with the message id and clears the reply strip', async () => {
    const user = userEvent.setup();
    backend(); renderAt('/messages/c1');
    const log = await screen.findByRole('log', { name: 'Messages' }); await openSocket();
    const row = within(log).getByText('send the notes').closest('[data-msg-id]');
    await user.click(within(row).getByRole('button', { name: 'Reply' }));
    expect(screen.getByText('Replying to Meera Rao')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Message Meera Rao' }), 'on it{Enter}');
    expect(sentFrames('CHAT_MESSAGE')[0].payload).toMatchObject({ text: 'on it', replyTo: 'm2' });
    await waitFor(() => expect(screen.queryByText('Replying to Meera Rao')).toBeNull());
  });

  it('edit saves through MESSAGE_EDIT for my own message', async () => {
    const user = userEvent.setup();
    backend(); renderAt('/messages/c1');
    const log = await screen.findByRole('log', { name: 'Messages' }); await openSocket();
    const mine = within(log).getByText('will do').closest('[data-msg-id]');
    await user.click(within(mine).getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit message' }));
    const box = await within(log).findByRole('textbox', { name: 'Edit message' });
    await user.clear(box); await user.type(box, 'will do tonight{Enter}');
    expect(sentFrames('MESSAGE_EDIT')[0].payload).toEqual({ messageId: 'm3', text: 'will do tonight' });
    expect(await within(log).findByText('will do tonight')).toBeInTheDocument();
  });

  it('a conversation I cannot access shows "Conversation not found" (no existence leak)', async () => {
    backend({ 'GET /conversations/zzz': json(404, { error: { code: 'NOT_FOUND', message: 'nope' } }) });
    renderAt('/messages/zzz');
    expect(await screen.findByText('Conversation not found')).toBeInTheDocument();
  });

  it('mobile: header has a back link, the tab bar is hidden, and the composer is present', async () => {
    setViewport(390); backend(); renderAt('/messages/c1');
    await screen.findByRole('log', { name: 'Messages' });
    expect(screen.getByRole('link', { name: 'Back to messages' })).toHaveAttribute('href', '/messages');
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Message Meera Rao' })).toBeInTheDocument();
  });
});

describe('new conversation and friends', () => {
  const friendsList = { data: [{ user: meera, since: 'x', status: 'accepted' }, { user: U('u3', 'Kabir'), since: 'x', status: 'accepted' }] };

  it('starts a direct chat from the friends picker and opens it', async () => {
    const user = userEvent.setup();
    backend({ 'GET /friends': friendsList, 'POST /conversations': json(201, { data: conv('c9') }), 'GET /conversations/c9': { data: conv('c9') }, 'GET /conversations/c9/messages': { data: [], meta: { hasMore: false } }, 'GET /conversations/c9/read-state': { data: [] } });
    renderAt('/messages');
    await user.click(await screen.findByRole('button', { name: 'New conversation' }));
    const dialog = await screen.findByRole('dialog', { name: 'New conversation' });
    await user.click(await within(dialog).findByRole('button', { name: /Kabir Rao/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/messages/c9'));
    const post = globalThis.fetch.mock.calls.find(([u, i]) => u.endsWith('/conversations') && i.method === 'POST');
    expect(JSON.parse(post[1].body)).toEqual({ type: 'direct', userId: 'u3' });
  });

  it('group needs a name and at least 2 friends before Create is enabled', async () => {
    const user = userEvent.setup();
    const three = { data: [...friendsList.data, { user: U('u4', 'Zoya'), since: 'x', status: 'accepted' }] };
    backend({ 'GET /friends': three, 'POST /conversations': json(201, { data: conv('g1', { type: 'group', title: 'Crew' }) }), 'GET /conversations/g1': { data: conv('g1', { type: 'group', title: 'Crew' }) }, 'GET /conversations/g1/messages': { data: [], meta: { hasMore: false } }, 'GET /conversations/g1/read-state': { data: [] } });
    renderAt('/messages');
    await user.click(await screen.findByRole('button', { name: 'New conversation' }));
    const dialog = await screen.findByRole('dialog', { name: 'New conversation' });
    await user.click(within(dialog).getByRole('tab', { name: 'Group' }));
    const create = within(dialog).getByRole('button', { name: 'Create' });
    expect(create).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Group name'), 'Crew');
    await user.click(await within(dialog).findByRole('checkbox', { name: /Meera/ }));
    expect(create).toBeDisabled();
    await user.click(within(dialog).getByRole('checkbox', { name: /Kabir/ }));
    expect(create).toBeEnabled();
    await user.click(create);
    await waitFor(() => expect(router.state.location.pathname).toBe('/messages/g1'));
    const post = globalThis.fetch.mock.calls.find(([u, i]) => u.endsWith('/conversations') && i.method === 'POST');
    expect(JSON.parse(post[1].body)).toEqual({ type: 'group', title: 'Crew', memberIds: ['u2', 'u3'] });
  });

  it('friends page: accept an incoming request and add someone from search', async () => {
    const user = userEvent.setup();
    const f = backend({
      'GET /friends': { data: [] },
      'GET /friends/requests': { data: { incoming: [{ user: U('u5', 'Rohan'), since: 'x', status: 'pending' }], outgoing: [] } },
      'POST /friends/requests/u5/accept': { data: null },
      'GET /users/search': { data: [U('u6', 'Tara')] },
      'POST /friends/requests': json(201, { data: null }),
    });
    renderAt('/friends');
    await user.click(await screen.findByRole('tab', { name: /Requests/ }));
    await user.click(await screen.findByRole('button', { name: 'Accept Rohan Rao' }));
    await waitFor(() => expect(f.calls.some((c) => c.key === 'POST /friends/requests/u5/accept')).toBe(true));
    await user.click(screen.getByRole('tab', { name: 'Find people' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search by name or username' }), 'tar');
    await user.click(await screen.findByRole('button', { name: 'Add Tara Rao' }, { timeout: 3000 }));
    await waitFor(() => expect(f.calls.find((c) => c.key === 'POST /friends/requests')?.body).toEqual({ userId: 'u6' }));
    expect(await screen.findByText('Requested')).toBeInTheDocument();
  });
});
