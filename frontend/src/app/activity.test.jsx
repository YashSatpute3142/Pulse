import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { Providers } from './providers.jsx';
import { routes } from './router.jsx';
import { tokenStore } from '../api/tokenStore.js';
import { FakeWebSocket, ME, json, routeFetch, setViewport } from '../test/helpers.js';

const meera = { id: 'u2', username: 'meera', displayName: 'Meera Rao', avatarUrl: null };
const kabir = { id: 'u3', username: 'kabir', displayName: 'Kabir Rao', avatarUrl: null };
const iso = (minAgo = 0) => new Date(Date.now() - minAgo * 60000).toISOString();
const act1 = (type, label, extra = {}) => ({ userId: 'u2', type, label, visibility: 'friends', startedAt: iso(5), updatedAt: iso(2), expiresAt: null, ...extra });

function backend(feed, extra = {}) {
  return routeFetch({
    'POST /auth/refresh': { data: { user: ME, accessToken: 'AT' } },
    'POST /auth/ws-ticket': { data: { ticket: 't', expiresInSec: 30 } },
    'GET /activity/feed': { data: feed },
    'GET /activity/me': { data: null },
    'GET /conversations': { data: [], meta: { hasMore: false } },
    ...extra,
  });
}
const renderAt = (path) => { render(<Providers><RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} /></Providers>); };
const socket = () => FakeWebSocket.instances.at(-1);
async function openSocket() {
  await waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0));
  act(() => socket().serverSend('READY', { userId: 'u1', serverNow: Date.now(), heartbeatSec: 30 }));
}

beforeEach(() => { tokenStore.clear(); localStorage.clear(); FakeWebSocket.instances = []; vi.stubGlobal('WebSocket', FakeWebSocket); setViewport(1440); });

describe('live activity', () => {
  it('lists friends with a live activity, hides expired ones, and shows presence text', async () => {
    backend([
      { user: meera, activity: act1('studying', 'Organic chemistry'), presence: 'online' },
      { user: kabir, activity: act1('gaming', 'Old', { userId: 'u3', expiresAt: iso(1) }), presence: 'offline' },
    ]);
    renderAt('/activity');
    const card = await screen.findByRole('article', { name: 'Meera Rao, Studying' });
    expect(within(card).getByText('Organic chemistry')).toBeInTheDocument();
    expect(within(card).getByText(/updated 2m ago/)).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: /Kabir Rao/ })).not.toBeInTheDocument();
  });

  it('shows the empty state when nobody is live', async () => {
    backend([]); renderAt('/activity');
    expect((await screen.findAllByText('Nobody is live right now')).length).toBeGreaterThan(0);
  });

  it('shows an error state with Retry when the feed fails', async () => {
    backend(null, { 'GET /activity/feed': json(500, { error: { code: 'INTERNAL', message: 'boom' } }) });
    renderAt('/activity');
    expect((await screen.findAllByText('Could not load live activity', {}, { timeout: 5000 })).length).toBeGreaterThan(0);
  }, 10000);

  it('ACTIVITY_CHANGED updates, adds (refetch) and removes cards', async () => {
    const fn = backend([{ user: meera, activity: act1('studying', 'Chem'), presence: 'online' }]);
    renderAt('/activity');
    await screen.findByRole('article', { name: 'Meera Rao, Studying' });
    await openSocket();
    act(() => socket().serverSend('ACTIVITY_CHANGED', { userId: 'u2', activity: act1('coding', 'Pulse frontend') }));
    expect(await screen.findByRole('article', { name: 'Meera Rao, Coding' })).toBeInTheDocument();
    // unknown friend -> feed refetch
    const before = fn.calls.filter((c) => c.key === 'GET /activity/feed').length;
    act(() => socket().serverSend('ACTIVITY_CHANGED', { userId: 'u3', activity: act1('gaming', 'x', { userId: 'u3' }) }));
    await waitFor(() => expect(fn.calls.filter((c) => c.key === 'GET /activity/feed').length).toBe(before + 1));
    act(() => socket().serverSend('ACTIVITY_CHANGED', { userId: 'u2', activity: null }));
    await waitFor(() => expect(screen.queryByRole('article', { name: /Meera Rao/ })).not.toBeInTheDocument());
  });
});

describe('my activity', () => {
  it('loads from GET /activity/me and follows ACTIVITY_CHANGED for me', async () => {
    backend([], { 'GET /activity/me': { data: act1('coding', 'Pulse', { userId: 'u1' }) } });
    renderAt('/activity');
    expect(await screen.findByRole('article', { name: 'Aarav Kapoor, Coding' })).toBeInTheDocument();
    await openSocket();
    act(() => socket().serverSend('ACTIVITY_CHANGED', { userId: 'u1', activity: null }));
    await waitFor(() => expect(screen.queryByRole('article', { name: /Aarav/ })).not.toBeInTheDocument());
  });
});

describe('activity editor', () => {
  it('PUTs the chosen type, label, visibility and expiry, then shows my card; Clear sends DELETE', async () => {
    const fn = backend([], {
      'PUT /activity/me': (init) => { const b = JSON.parse(init.body); return { data: { userId: 'u1', ...b, startedAt: iso(), updatedAt: iso(), expiresAt: iso(-60) } }; },
      'DELETE /activity/me': { data: null },
    });
    renderAt('/activity');
    const user = userEvent.setup();
    const form = await screen.findByRole('form', { name: 'Set your activity' });
    await user.click(within(form).getByLabelText('Coding'));
    await user.type(within(form).getByLabelText('What exactly?'), 'Pulse frontend');
    await user.click(within(form).getByRole('radio', { name: 'Everyone' }));
    await user.selectOptions(within(form).getByLabelText('Clear automatically'), '60');
    await user.click(within(form).getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(fn.calls.find((c) => c.key === 'PUT /activity/me')).toBeTruthy());
    expect(fn.calls.find((c) => c.key === 'PUT /activity/me').body).toEqual({ type: 'coding', visibility: 'everyone', label: 'Pulse frontend', expiresInMin: 60 });
    expect(await screen.findByRole('article', { name: 'Aarav Kapoor, Coding' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(fn.calls.find((c) => c.key === 'DELETE /activity/me')).toBeTruthy());
    await waitFor(() => expect(screen.queryByRole('article', { name: /Aarav/ })).not.toBeInTheDocument());
  });
});
