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
    'GET /activity/me': { data: null },
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

const ackLast = (type, data) => act(() => socket().serverSend('ACK', { replyTo: sentFrames(type).at(-1).id, ok: true, data }));
const poll = (o = {}) => ({ id: 'p1', conversationId: 'c1', messageId: 'm4', creatorId: 'u2', question: 'Which day for the review?', options: [{ id: 'o1', text: 'Friday' }, { id: 'o2', text: 'Monday' }], multiple: false, anonymous: false, closesAt: null, closedAt: null, counts: { o1: 3, o2: 1 }, myVote: [], ...o });
const pollMsg = () => M('m4', 'u2', '', { type: 'poll', pollId: 'p1' });
const withPoll = (p = poll()) => backend({
  'GET /conversations/c1/messages': { data: [pollMsg(), M('m1', 'u2', 'hi')], meta: { hasMore: false } },
  'GET /polls/p1': { data: p },
});
const open = async () => { renderAt('/messages/c1'); await screen.findByRole('log', { name: 'Messages' }); await openSocket(); };

describe('polls', () => {
  it('renders the poll card with counts and percent, and a vote sends POLL_VOTE and updates optimistically', async () => {
    withPoll(); await open();
    const card = await screen.findByRole('group', { name: 'Poll: Which day for the review?' });
    expect(within(card).getByText('4 votes · single choice')).toBeInTheDocument();
    expect(within(card).getByRole('radio', { name: /Friday/ })).toHaveTextContent('75%');
    await userEvent.setup().click(within(card).getByRole('radio', { name: /Monday/ }));
    await waitFor(() => expect(sentFrames('POLL_VOTE')).toHaveLength(1));
    expect(sentFrames('POLL_VOTE')[0].payload).toEqual({ pollId: 'p1', optionIds: ['o2'] });
    expect(within(card).getByRole('radio', { name: /Monday/ })).toHaveAttribute('aria-checked', 'true');
    expect(within(card).getByRole('radio', { name: /Monday/ })).toHaveTextContent('40%'); // 2 of 5
    ackLast('POLL_VOTE', {});
  });

  it('rolls the vote back and shows an error when the server rejects it', async () => {
    withPoll(); await open();
    const card = await screen.findByRole('group', { name: /Poll:/ });
    await userEvent.setup().click(within(card).getByRole('radio', { name: /Monday/ }));
    await waitFor(() => expect(sentFrames('POLL_VOTE')).toHaveLength(1));
    act(() => socket().serverSend('ERROR', { replyTo: sentFrames('POLL_VOTE')[0].id, code: 'POLL_CLOSED', message: 'This poll is closed' }));
    expect(await screen.findByText('This poll is closed')).toBeInTheDocument();
    expect(within(card).getByRole('radio', { name: /Monday/ })).toHaveAttribute('aria-checked', 'false');
    expect(within(card).getByRole('radio', { name: /Monday/ })).toHaveTextContent('25%');
  });

  it('multiple choice toggles; clicking my single vote again retracts it', async () => {
    withPoll(poll({ multiple: true, myVote: ['o1'] })); await open();
    const card = await screen.findByRole('group', { name: /Poll:/ });
    const user = userEvent.setup();
    await user.click(within(card).getByRole('checkbox', { name: /Monday/ }));
    await waitFor(() => expect(sentFrames('POLL_VOTE').at(-1).payload.optionIds).toEqual(['o1', 'o2']));
    await user.click(within(card).getByRole('checkbox', { name: /Friday/ }));
    await waitFor(() => expect(sentFrames('POLL_VOTE').at(-1).payload.optionIds).toEqual(['o2']));
  });

  it('POLL_UPDATED changes counts live (keeping my vote); closed polls cannot be voted on', async () => {
    withPoll(poll({ myVote: ['o1'] })); await open();
    const card = await screen.findByRole('group', { name: /Poll:/ });
    act(() => socket().serverSend('POLL_UPDATED', { pollId: 'p1', counts: { o1: 3, o2: 3 }, closedAt: null }));
    await waitFor(() => expect(within(card).getByRole('radio', { name: /Monday/ })).toHaveTextContent('50%'));
    expect(within(card).getByRole('radio', { name: /Friday/ })).toHaveAttribute('aria-checked', 'true');
    act(() => socket().serverSend('POLL_UPDATED', { pollId: 'p1', counts: { o1: 3, o2: 3 }, closedAt: new Date().toISOString() }));
    await waitFor(() => expect(within(card).getByRole('radio', { name: /Monday/ })).toBeDisabled());
    expect(within(card).getByText(/closed/)).toBeInTheDocument();
  });

  it('creates a poll: validates, then sends POLL_CREATE with trimmed options and flags', async () => {
    backend(); await open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Create a poll' }));
    const dlg = await screen.findByRole('dialog', { name: 'Create a poll' });
    const post = within(dlg).getByRole('button', { name: 'Post poll' });
    expect(post).toBeDisabled();
    await user.type(within(dlg).getByLabelText('Question'), ' Lunch? ');
    await user.type(within(dlg).getByLabelText('Option 1'), 'Pizza');
    await user.type(within(dlg).getByLabelText('Option 2'), 'pizza');
    expect(post).toBeDisabled(); // duplicate option
    await user.clear(within(dlg).getByLabelText('Option 2'));
    await user.type(within(dlg).getByLabelText('Option 2'), 'Salad');
    await user.click(within(dlg).getByRole('switch', { name: 'Anonymous votes' }));
    await user.selectOptions(within(dlg).getByLabelText('Close poll'), '60');
    await user.click(post);
    await waitFor(() => expect(sentFrames('POLL_CREATE')).toHaveLength(1));
    expect(sentFrames('POLL_CREATE')[0].payload).toEqual({ conversationId: 'c1', question: 'Lunch?', options: ['Pizza', 'Salad'], anonymous: true, closesInMin: 60 });
    ackLast('POLL_CREATE', { poll: poll({ id: 'p9', question: 'Lunch?' }), message: M('m9', 'u1', '', { type: 'poll', pollId: 'p9' }) });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Create a poll' })).not.toBeInTheDocument());
    expect(await screen.findByRole('group', { name: 'Poll: Lunch?' })).toBeInTheDocument();
  });

  it('POLL_CREATED from someone else adds the poll message', async () => {
    backend(); await open();
    act(() => socket().serverSend('POLL_CREATED', { poll: poll({ id: 'p7', question: 'Movie night?' }), message: M('m7', 'u2', '', { type: 'poll', pollId: 'p7' }) }));
    expect(await screen.findByRole('group', { name: 'Poll: Movie night?' })).toBeInTheDocument();
  });
});

describe('sparks', () => {
  it('shows a spark, Another fetches a new one, Use fills the box and never sends', async () => {
    let n = 0;
    backend({ 'GET /sparks/random': () => ({ data: { id: `s${++n}`, kind: 'question', text: `Question number ${n}?` } }) });
    await open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Get a spark' }));
    expect(await screen.findByText('Question number 1?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Another' }));
    expect(await screen.findByText('Question number 2?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use' }));
    expect(screen.getByRole('textbox', { name: 'Message Meera Rao' })).toHaveValue('Question number 2?');
    expect(sentFrames('CHAT_MESSAGE')).toHaveLength(0);
    expect(screen.queryByText('Question number 2?', { selector: 'p' })).not.toBeInTheDocument();
  });
  it('shows an error line when no spark can be loaded', async () => {
    backend({ 'GET /sparks/random': () => new Error('offline') }); await open();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Get a spark' }));
    expect(await screen.findByText('Could not load a spark.')).toBeInTheDocument();
  });
});

describe('attachments', () => {
  const img = { kind: 'image', url: 'https://cdn.test/a.png', name: 'a.png', mime: 'image/png', size: 2048, width: 10, height: 10 };
  const doc = { kind: 'file', url: 'https://cdn.test/n.pdf', name: 'notes.pdf', mime: 'application/pdf', size: 2097152 };

  it('uploads a chosen file, then sends it in CHAT_MESSAGE with no text; the send button waits for the upload', async () => {
    let finish;
    const fn = backend({ 'POST /uploads': () => new Promise((r) => { finish = r; }) });
    await open();
    const user = userEvent.setup();
    const file = new File(['x'], 'notes.pdf', { type: 'application/pdf' });
    await user.upload(await screen.findByLabelText('Choose files to attach'), file);
    expect(await screen.findByText('uploading…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    expect(fn.calls.find((c) => c.key === 'POST /uploads')).toBeTruthy();
    expect(fn.mock.calls.find((c) => c[0].includes('/uploads'))[1].body).toBeInstanceOf(FormData);
    await act(async () => { finish(new Response(JSON.stringify({ data: doc }), { status: 200, headers: { 'Content-Type': 'application/json' } })); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(sentFrames('CHAT_MESSAGE')).toHaveLength(1));
    expect(sentFrames('CHAT_MESSAGE')[0].payload).toMatchObject({ conversationId: 'c1', text: '', attachments: [doc] });
    expect(screen.queryByRole('list', { name: 'Attachments' })).not.toBeInTheDocument(); // tray cleared
    expect(await screen.findByText('notes.pdf')).toBeInTheDocument(); // optimistic row
  });

  it('shows the server error for a rejected upload and lets the user remove it', async () => {
    backend({ 'POST /uploads': () => new Response(JSON.stringify({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'File type not allowed' } }), { status: 415, headers: { 'Content-Type': 'application/json' } }) });
    await open();
    const user = userEvent.setup();
    await user.upload(await screen.findByLabelText('Choose files to attach'), new File(['x'], 'run.exe'));
    expect(await screen.findByText('File type not allowed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Remove run.exe' }));
    expect(screen.queryByText('run.exe')).not.toBeInTheDocument();
  });

  it('renders image and file attachments safely; non-http(s) URLs are never linked', async () => {
    backend({ 'GET /conversations/c1/messages': { data: [
      M('m3', 'u2', 'bad', { attachments: [{ kind: 'file', url: 'javascript:alert(1)', name: 'evil.js', size: 1 }] }),
      M('m2', 'u2', 'docs', { attachments: [doc] }),
      M('m1', 'u2', 'pic', { attachments: [img] }),
    ], meta: { hasMore: false } } });
    renderAt('/messages/c1');
    const link = await screen.findByRole('link', { name: /Open image a\.png/ });
    expect(link).toHaveAttribute('href', 'https://cdn.test/a.png');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(link).getByRole('img', { name: 'a.png' })).toBeInTheDocument();
    const file = screen.getByRole('link', { name: /notes\.pdf/ });
    expect(file).toHaveAttribute('href', 'https://cdn.test/n.pdf');
    expect(file).toHaveTextContent('2.0 MB');
    expect(screen.getByText('Attachment unavailable')).toBeInTheDocument();
    expect(document.querySelector('a[href^="javascript"]')).toBeNull();
  });
});
