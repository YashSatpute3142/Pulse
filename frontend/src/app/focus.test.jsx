import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { Providers } from './providers.jsx';
import { routes } from './router.jsx';
import { tokenStore } from '../api/tokenStore.js';
import { FakeWebSocket, ME, routeFetch, setViewport } from '../test/helpers.js';

const meera = { id: 'u2', username: 'meera', displayName: 'Meera Rao', avatarUrl: null };
const iso = (minFromNow = 0) => new Date(Date.now() + minFromNow * 60000).toISOString();
const room = (o = {}) => ({
  id: 'r1', title: 'Thesis sprint', hostId: 'u2', durationSec: 1500, status: 'lobby', startedAt: null, endsAt: null,
  participants: [{ user: meera, joinedAt: iso(-3) }, { user: ME, joinedAt: iso(-1) }], invitedIds: [], ...o,
});
const msg = (id, text, o = {}) => ({ id, roomId: 'r1', senderId: 'u2', text, createdAt: iso(-2), ...o });

function backend(extra = {}) {
  return routeFetch({
    'POST /auth/refresh': { data: { user: ME, accessToken: 'AT' } },
    'POST /auth/ws-ticket': { data: { ticket: 't', expiresInSec: 30 } },
    'GET /activity/feed': { data: [] },
    'GET /conversations': { data: [], meta: { hasMore: false } },
    'GET /friends': { data: [{ user: meera, status: 'accepted' }] },
    'GET /focus-rooms': { data: [room()] },
    ...extra,
  });
}
const renderAt = (path) => { render(<Providers><RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} /></Providers>); };
const socket = () => FakeWebSocket.instances.at(-1);
const sent = (type) => socket().sent.filter((f) => f.type === type);
async function openSocket() {
  await waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0));
  act(() => socket().serverSend('READY', { userId: 'u1', serverNow: Date.now(), heartbeatSec: 30 }));
}
const ack = (type, data) => act(() => socket().serverSend('ACK', { replyTo: sent(type).at(-1).id, ok: true, data }));
const fail = (type, code, message) => act(() => socket().serverSend('ERROR', { replyTo: sent(type).at(-1).id, code, message }));
async function joinRoom(r = room(), messages = [msg('m1', 'welcome'), msg('s1', 'Meera joined', { type: 'system', senderId: null })]) {
  renderAt('/focus/r1');
  await openSocket();
  await waitFor(() => expect(sent('ROOM_JOIN')).toHaveLength(1));
  expect(sent('ROOM_JOIN')[0].payload).toEqual({ roomId: 'r1' });
  ack('ROOM_JOIN', { room: r, messages, serverNow: Date.now() });
  return screen.findByRole('heading', { level: 1, name: r.title });
}

beforeEach(() => { tokenStore.clear(); localStorage.clear(); FakeWebSocket.instances = []; vi.stubGlobal('WebSocket', FakeWebSocket); setViewport(1440); });

describe('focus rooms list', () => {
  it('lists rooms for both scopes and opens the new-room modal', async () => {
    backend(); renderAt('/focus');
    await waitFor(() => expect(screen.getAllByRole('link', { name: /Thesis sprint/ })).toHaveLength(2));
    await userEvent.setup().click(screen.getAllByRole('button', { name: 'New room' })[0]);
    expect(await screen.findByRole('dialog', { name: 'New focus room' })).toBeInTheDocument();
  });
  it('shows empty states', async () => {
    backend({ 'GET /focus-rooms': { data: [] } }); renderAt('/focus');
    expect(await screen.findByText('No open rooms')).toBeInTheDocument();
    expect(screen.getByText('You have no rooms yet')).toBeInTheDocument();
  });
});

describe('creating a room', () => {
  it('sends ROOM_CREATE with title, duration and invited friends, then opens the room', async () => {
    backend(); renderAt('/focus');
    const user = userEvent.setup();
    await openSocket();
    await user.click((await screen.findAllByRole('button', { name: 'New room' }))[0]);
    const dlg = await screen.findByRole('dialog', { name: 'New focus room' });
    await user.type(within(dlg).getByLabelText('Room name'), '  Deep work ');
    await user.selectOptions(within(dlg).getByLabelText('Session length'), '45');
    await user.click(await within(dlg).findByRole('checkbox', { name: /Meera Rao/ }));
    await user.click(within(dlg).getByRole('button', { name: 'Create room' }));
    await waitFor(() => expect(sent('ROOM_CREATE')).toHaveLength(1));
    expect(sent('ROOM_CREATE')[0].payload).toEqual({ title: 'Deep work', durationSec: 2700, inviteUserIds: ['u2'] });
    ack('ROOM_CREATE', { room: room({ id: 'r1', title: 'Deep work', hostId: 'u1' }) });
    await waitFor(() => expect(sent('ROOM_JOIN')).toHaveLength(1));
  });
  it('shows the server error and stays open', async () => {
    backend(); renderAt('/focus');
    const user = userEvent.setup(); await openSocket();
    await user.click((await screen.findAllByRole('button', { name: 'New room' }))[0]);
    const dlg = await screen.findByRole('dialog', { name: 'New focus room' });
    await user.type(within(dlg).getByLabelText('Room name'), 'x');
    await user.click(within(dlg).getByRole('button', { name: 'Create room' }));
    await waitFor(() => expect(sent('ROOM_CREATE')).toHaveLength(1));
    fail('ROOM_CREATE', 'VALIDATION_ERROR', 'Duration is not allowed');
    expect(await within(dlg).findByRole('alert')).toHaveTextContent('Duration is not allowed');
  });
});

describe('room (lobby)', () => {
  it('guest sees the full duration, "Waiting for host", chat history with a system line, and no Start', async () => {
    backend(); await joinRoom();
    expect(screen.getByRole('timer')).toHaveTextContent('25:00');
    expect(screen.getByText('Waiting for host')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
    const log = screen.getByRole('log', { name: 'Room messages' });
    expect(within(log).getByText('welcome')).toBeInTheDocument();
    expect(within(log).getByText('Meera joined')).toBeInTheDocument();
    expect(screen.getByText('host')).toBeInTheDocument();
  });

  it('host sees Start and Invite; Start sends ROOM_START', async () => {
    backend(); await joinRoom(room({ hostId: 'u1' }));
    expect(screen.getByText('Ready when you are')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Invite friends' })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(sent('ROOM_START')).toHaveLength(1));
    expect(sent('ROOM_START')[0].payload).toEqual({ roomId: 'r1' });
  });

  it('shows an error state when joining is refused', async () => {
    backend(); renderAt('/focus/r1'); await openSocket();
    await waitFor(() => expect(sent('ROOM_JOIN')).toHaveLength(1));
    fail('ROOM_JOIN', 'FORBIDDEN', 'You do not have access to this room');
    expect(await screen.findByText('Could not open this room', {}, { timeout: 4000 })).toBeInTheDocument();
  }, 10000);
});

describe('room events', () => {
  it('TIMER_UPDATE starts the countdown from the server clock; STATE, joins, leaves and messages update live', async () => {
    backend(); await joinRoom();
    act(() => socket().serverSend('ROOM_TIMER_UPDATE', { roomId: 'r1', status: 'running', endsAt: iso(10), serverNow: Date.now() }));
    await waitFor(() => expect(screen.getByRole('timer')).toHaveTextContent(/^(09:5\d|10:0[01])$/));
    expect(screen.getByText('Session running')).toBeInTheDocument();

    // a server clock 2 minutes ahead of ours shortens the remaining time
    act(() => socket().serverSend('ROOM_TIMER_UPDATE', { roomId: 'r1', status: 'running', endsAt: iso(10), serverNow: Date.now() + 120000 }));
    await waitFor(() => expect(screen.getByRole('timer')).toHaveTextContent(/^(07:5\d|08:0[01])$/));

    const kabir = { id: 'u3', username: 'kabir', displayName: 'Kabir Rao', avatarUrl: null };
    act(() => socket().serverSend('ROOM_PARTICIPANT_JOINED', { roomId: 'r1', user: kabir, at: iso() }));
    const people = screen.getByRole('list', { name: 'Participants' });
    expect(await within(people).findByText('Kabir')).toBeInTheDocument();
    act(() => socket().serverSend('ROOM_PARTICIPANT_LEFT', { roomId: 'r1', user: kabir, at: iso() }));
    await waitFor(() => expect(within(people).queryByText('Kabir')).not.toBeInTheDocument());

    act(() => socket().serverSend('ROOM_MESSAGE_NEW', { roomId: 'r1', message: msg('m2', 'ten minutes left', { createdAt: iso() }) }));
    expect(await screen.findByText('ten minutes left')).toBeInTheDocument();
    act(() => socket().serverSend('ROOM_MESSAGE_NEW', { roomId: 'r1', message: msg('m2', 'ten minutes left') })); // duplicate
    expect(screen.getAllByText('ten minutes left')).toHaveLength(1);
  });

  it('COMPLETED and CANCELLED end the session and close the chat box', async () => {
    backend(); await joinRoom(room({ status: 'running', endsAt: iso(5) }));
    expect(screen.getByRole('textbox', { name: 'Message the room' })).toBeInTheDocument();
    act(() => socket().serverSend('ROOM_COMPLETED', { roomId: 'r1', completedAt: iso(), durationSec: 1500 }));
    expect(await screen.findByText('Session complete', { selector: '[role=status]' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Message the room' })).not.toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('00:00');
    act(() => socket().serverSend('ROOM_CANCELLED', { roomId: 'r1' }));
    expect(await screen.findByText('This room was cancelled')).toBeInTheDocument();
  });

  it('ignores events for rooms that are not open', async () => {
    backend(); await joinRoom();
    act(() => socket().serverSend('ROOM_MESSAGE_NEW', { roomId: 'other', message: msg('x', 'nope', { roomId: 'other' }) }));
    expect(screen.queryByText('nope')).not.toBeInTheDocument();
  });
});

describe('room chat and actions', () => {
  it('sends ROOM_MESSAGE with trimmed text and clears the box on ACK', async () => {
    backend(); await joinRoom(room({ status: 'running', endsAt: iso(5) }));
    const user = userEvent.setup();
    const box = screen.getByRole('textbox', { name: 'Message the room' });
    await user.type(box, '  hello team ');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(sent('ROOM_MESSAGE')).toHaveLength(1));
    expect(sent('ROOM_MESSAGE')[0].payload).toEqual({ roomId: 'r1', text: 'hello team' });
    ack('ROOM_MESSAGE', {});
    await waitFor(() => expect(box).toHaveValue(''));
  });

  it('host cancels after confirming; leave sends ROOM_LEAVE and returns to the list', async () => {
    backend(); await joinRoom(room({ hostId: 'u1' }));
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Cancel room' }));
    const dlg = await screen.findByRole('dialog', { name: 'Cancel this room?' });
    await user.click(within(dlg).getByRole('button', { name: 'Cancel room' }));
    await waitFor(() => expect(sent('ROOM_CANCEL')).toHaveLength(1));
    ack('ROOM_CANCEL', {});
    await user.click(screen.getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(sent('ROOM_LEAVE')).toHaveLength(1));
    ack('ROOM_LEAVE', {});
    expect(await screen.findByRole('heading', { level: 1, name: 'Focus' })).toBeInTheDocument();
  });

  it('invite modal hides people already in the room and sends ROOM_INVITE', async () => {
    const kabir = { id: 'u3', username: 'kabir', displayName: 'Kabir Rao', avatarUrl: null };
    backend({ 'GET /friends': { data: [{ user: meera, status: 'accepted' }, { user: kabir, status: 'accepted' }] } });
    await joinRoom(room({ hostId: 'u1' }));
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Invite friends' }));
    const dlg = await screen.findByRole('dialog', { name: 'Invite friends' });
    expect(await within(dlg).findByRole('checkbox', { name: /Kabir Rao/ })).toBeInTheDocument();
    expect(within(dlg).queryByRole('checkbox', { name: /Meera Rao/ })).not.toBeInTheDocument();
    await user.click(within(dlg).getByRole('checkbox', { name: /Kabir Rao/ }));
    await user.click(within(dlg).getByRole('button', { name: 'Send invites' }));
    await waitFor(() => expect(sent('ROOM_INVITE')).toHaveLength(1));
    expect(sent('ROOM_INVITE')[0].payload).toEqual({ roomId: 'r1', userIds: ['u3'] });
  });
});
