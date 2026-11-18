import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { Providers } from './providers.jsx';
import { routes } from './router.jsx';
import { tokenStore } from '../api/tokenStore.js';
import { FakeWebSocket, ME, routeFetch, setViewport } from '../test/helpers.js';

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

const registerAck = (data) => {
  const reg = sentFrames('REGISTER').at(-1);
  act(() => socket().serverSend('ACK', { replyTo: reg.id, ok: true, data }));
};
const listRow = async () => within(await screen.findByRole('complementary', { name: 'Conversations' })).findByRole('link', { name: /Meera Rao/ });

describe('presence', () => {
  it('REGISTER snapshot then PRESENCE_UPDATE drive the dot, header status and list dot', async () => {
    backend(); renderAt('/messages/c1');
    await screen.findByRole('log', { name: 'Messages' });
    const row = await listRow();
    expect(within(row).getByText('offline')).toBeInTheDocument(); // unknown = offline
    await openSocket();
    registerAck({ presence: [{ userId: 'u2', status: 'online' }] });
    expect(await screen.findByText(/@meera · online/)).toBeInTheDocument();
    expect(within(row).getByText('online')).toBeInTheDocument();
    act(() => socket().serverSend('PRESENCE_UPDATE', { userId: 'u2', status: 'away' }));
    expect(await screen.findByText(/@meera · away/)).toBeInTheDocument();
    act(() => socket().serverSend('PRESENCE_UPDATE', { userId: 'u2', status: 'offline', lastSeenAt: new Date().toISOString() }));
    await waitFor(() => expect(screen.queryByText(/@meera ·/)).not.toBeInTheDocument());
  });

  it('accepts a { userId: status } map snapshot and ignores junk', async () => {
    backend(); renderAt('/messages/c1');
    await screen.findByRole('log', { name: 'Messages' });
    await openSocket();
    registerAck({ u2: 'online', u9: 'sleeping' });
    expect(await screen.findByText(/@meera · online/)).toBeInTheDocument();
  });
});

describe('typing', () => {
  it('shows "Meera is typing…" in the line, header and list; clears on stop, on a new message, and after expiry', async () => {
    backend(); renderAt('/messages/c1');
    await screen.findByRole('log', { name: 'Messages' });
    const row = await listRow();
    await openSocket();
    act(() => socket().serverSend('TYPING_UPDATE', { conversationId: 'c1', userId: 'u2', typing: true }));
    expect(await screen.findByText('Meera is typing…')).toBeInTheDocument();
    expect(within(row).getByText('typing…')).toBeInTheDocument();
    act(() => socket().serverSend('TYPING_UPDATE', { conversationId: 'c1', userId: 'u2', typing: false }));
    await waitFor(() => expect(screen.queryByText('Meera is typing…')).not.toBeInTheDocument());

    act(() => socket().serverSend('TYPING_UPDATE', { conversationId: 'c1', userId: 'u2', typing: true }));
    expect(await screen.findByText('Meera is typing…')).toBeInTheDocument();
    act(() => socket().serverSend('MESSAGE_NEW', { message: M('m9', 'u2', 'here you go') }));
    await waitFor(() => expect(screen.queryByText('Meera is typing…')).not.toBeInTheDocument());
  });

  it('ignores my own typing echo', async () => {
    backend(); renderAt('/messages/c1');
    await screen.findByRole('log', { name: 'Messages' });
    await openSocket();
    act(() => socket().serverSend('TYPING_UPDATE', { conversationId: 'c1', userId: 'u1', typing: true }));
    expect(screen.queryByText(/is typing/)).not.toBeInTheDocument();
  });

  it('sends TYPING_START once while typing (throttled), TYPING_STOP when the box empties and on send', async () => {
    backend({ 'GET /conversations/c1/messages': { data: [], meta: { hasMore: false } } });
    renderAt('/messages/c1');
    const user = userEvent.setup();
    const box = await screen.findByRole('textbox', { name: 'Message Meera Rao' });
    await openSocket();
    await user.type(box, 'hey');
    await waitFor(() => expect(sentFrames('TYPING_START')).toHaveLength(1));
    expect(sentFrames('TYPING_START')[0].payload).toEqual({ conversationId: 'c1' });
    await user.clear(box);
    await waitFor(() => expect(sentFrames('TYPING_STOP')).toHaveLength(1));
    await user.type(box, 'ok{Enter}');
    await waitFor(() => expect(sentFrames('CHAT_MESSAGE')).toHaveLength(1));
    expect(sentFrames('TYPING_START')).toHaveLength(2);
    expect(sentFrames('TYPING_STOP')).toHaveLength(2);
  });

  it('sends nothing when the socket is not open', async () => {
    backend(); renderAt('/messages/c1');
    const user = userEvent.setup();
    const box = await screen.findByRole('textbox', { name: 'Message Meera Rao' });
    await user.type(box, 'hey');
    expect(FakeWebSocket.instances.flatMap((w) => w.sent).filter((f) => f.type === 'TYPING_START')).toHaveLength(0);
  });
});

describe('idle status', () => {
  it('reports away after 2 minutes without input and online again on activity', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      backend(); renderAt('/messages/c1');
      await screen.findByRole('log', { name: 'Messages' });
      await openSocket();
      await act(async () => { await vi.advanceTimersByTimeAsync(2 * 60 * 1000 + 100); });
      expect(sentFrames('USER_STATUS').map((f) => f.payload.status)).toEqual(['away']);
      act(() => { window.dispatchEvent(new Event('pointerdown')); });
      expect(sentFrames('USER_STATUS').map((f) => f.payload.status)).toEqual(['away', 'online']);
    } finally { vi.useRealTimers(); }
  });
});
