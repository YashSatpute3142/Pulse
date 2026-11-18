import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { Providers } from './providers.jsx';
import { routes } from './router.jsx';
import { tokenStore } from '../api/tokenStore.js';
import { FakeWebSocket, ME, json, routeFetch, setViewport } from '../test/helpers.js';

const unauth = json(401, { error: { code: 'UNAUTHENTICATED', message: 'no session' } });
const session = { data: { user: ME, accessToken: 'AT' } };

function renderAt(path) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<Providers><RouterProvider router={router} /></Providers>);
  return router;
}

beforeEach(() => {
  tokenStore.clear();
  localStorage.clear();
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
  setViewport(1440);
});

describe('boot and guards', () => {
  it('shows the splash, then the login page when refresh returns 401', async () => {
    routeFetch({ 'POST /auth/refresh': unauth });
    renderAt('/');
    expect(screen.getByRole('status')).toHaveTextContent('Loading Pulse');
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
  });

  it('redirects a protected deep link to /login and remembers it', async () => {
    routeFetch({ 'POST /auth/refresh': unauth });
    const router = renderAt('/messages/abc');
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.state).toEqual({ from: '/messages/abc' });
  });

  it('logged-in boot lands on Home inside the shell; the token stays out of web storage', async () => {
    routeFetch({ 'POST /auth/refresh': session, 'POST /auth/ws-ticket': { data: { ticket: 't', expiresInSec: 30 } }, 'GET /conversations': { data: [], meta: { hasMore: false } } });
    renderAt('/');
    expect(await screen.findByRole('heading', { level: 1, name: /Aarav/ })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    const dump = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
    expect(dump).not.toContain('AT');
    expect(tokenStore.get()).toBe('AT');
  });

  it('a logged-in user visiting /login is sent to Home', async () => {
    routeFetch({ 'POST /auth/refresh': session, 'POST /auth/ws-ticket': { data: { ticket: 't', expiresInSec: 30 } }, 'GET /conversations': { data: [], meta: { hasMore: false } } });
    const router = renderAt('/login');
    await screen.findByRole('heading', { level: 1, name: /Aarav/ });
    expect(router.state.location.pathname).toBe('/');
  });

  it('server unreachable at boot shows an error with Retry, not the login page', async () => {
    const f = routeFetch({ 'POST /auth/refresh': new TypeError('down') });
    renderAt('/');
    expect(await screen.findByText("Can't reach Pulse")).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull();
    f.mockClear();
  });

  it('unknown route inside the shell renders NotFound', async () => {
    routeFetch({ 'POST /auth/refresh': session, 'POST /auth/ws-ticket': { data: { ticket: 't', expiresInSec: 30 } }, 'GET /conversations': { data: [], meta: { hasMore: false } } });
    renderAt('/nope/nothing');
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
  });
});

describe('login and logout', () => {
  it('submits credentials, then returns to the page the user wanted', async () => {
    const user = userEvent.setup();
    const f = routeFetch({
      'POST /auth/refresh': unauth,
      'POST /auth/login': json(200, session),
      'POST /auth/ws-ticket': { data: { ticket: 't', expiresInSec: 30 } },
    });
    const router = renderAt('/settings');
    await screen.findByRole('heading', { name: 'Sign in' });
    await user.type(screen.getByLabelText('Email or username'), ' aarav ');
    await user.type(screen.getByLabelText('Password'), 'correct horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    expect(router.state.location.pathname).toBe('/settings');
    const login = f.calls.find((c) => c.key === 'POST /auth/login');
    expect(login.body).toEqual({ identifier: 'aarav', password: 'correct horse' });
  });

  it('shows a role=alert summary for wrong credentials and keeps the user on the form', async () => {
    const user = userEvent.setup();
    routeFetch({ 'POST /auth/refresh': unauth, 'POST /auth/login': json(401, { error: { code: 'UNAUTHENTICATED', message: 'Invalid credentials' } }) });
    renderAt('/login');
    await screen.findByRole('heading', { name: 'Sign in' });
    await user.type(screen.getByLabelText('Email or username'), 'aarav');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials');
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('blocks empty submit with field errors and makes no request', async () => {
    const user = userEvent.setup();
    const f = routeFetch({ 'POST /auth/refresh': unauth });
    renderAt('/login');
    await screen.findByRole('heading', { name: 'Sign in' });
    f.mockClear();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByLabelText('Email or username')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Email or username')).toHaveAccessibleDescription('Enter your email or username.');
    expect(f).not.toHaveBeenCalled();
  });

  it('password show/hide toggles type and aria-pressed', async () => {
    const user = userEvent.setup();
    routeFetch({ 'POST /auth/refresh': unauth });
    renderAt('/login');
    const field = await screen.findByLabelText('Password');
    expect(field).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(field).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('sign out confirms, calls /auth/logout, drops the token and lands on /login', async () => {
    const user = userEvent.setup();
    const f = routeFetch({
      'POST /auth/refresh': session,
      'POST /auth/ws-ticket': { data: { ticket: 't', expiresInSec: 30 } },
      'POST /auth/logout': new Response(null, { status: 204 }),
      'GET /conversations': { data: [], meta: { hasMore: false } },
    });
    const router = renderAt('/settings');
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    await user.click(screen.getAllByRole('button', { name: 'Sign out' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Sign out of Pulse?' });
    await user.click(within(dialog).getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(f.calls.some((c) => c.key === 'POST /auth/logout')).toBe(true);
    expect(tokenStore.get()).toBeNull();
  });
});

describe('shell by breakpoint', () => {
  const ok = { 'POST /auth/refresh': session, 'POST /auth/ws-ticket': { data: { ticket: 't', expiresInSec: 30 } }, 'GET /conversations': { data: [], meta: { hasMore: false } } };

  it('desktop shows the nav rail with five destinations, Home selected', async () => {
    routeFetch(ok); setViewport(1440);
    renderAt('/');
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    ['Home', 'Messages', 'Activity', 'Focus', 'Friends'].forEach((n) => expect(nav).toHaveTextContent ? expect(screen.getAllByRole('link', { name: n })[0]).toBeInTheDocument() : null);
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('complementary', { name: 'Conversations' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Live activity' })).toBeInTheDocument();
  });

  it('1024 laptop: the activity panel is not docked (it becomes a drawer)', async () => {
    routeFetch(ok); setViewport(1100);
    renderAt('/');
    await screen.findByRole('navigation', { name: 'Primary' });
    expect(screen.queryByRole('complementary', { name: 'Live activity' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Show live activity' })).toBeInTheDocument();
  });

  it('mobile shows the bottom tab bar with 5 tabs and Messages selected', async () => {
    routeFetch(ok); setViewport(390);
    renderAt('/messages');
    await screen.findByRole('heading', { level: 1, name: 'Messages' });
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(nav.querySelectorAll('a')).toHaveLength(5);
    expect(screen.getByRole('link', { name: 'Messages' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('mobile hides the tab bar on /messages/:id and /focus/:id', async () => {
    routeFetch(ok); setViewport(390);
    const router = renderAt('/messages/abc');
    await screen.findByRole('heading', { level: 1, name: 'Conversation' });
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();
    await router.navigate('/focus/r1');
    await screen.findByRole('heading', { level: 1, name: 'Focus room' });
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();
    await router.navigate('/focus');
    await screen.findByRole('heading', { level: 1, name: 'Focus' });
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
  });

  it('moves focus to the page h1 and sets the document title on navigation', async () => {
    routeFetch(ok); setViewport(390);
    const router = renderAt('/messages');
    await screen.findByRole('heading', { level: 1, name: 'Messages' });
    await router.navigate('/friends');
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Friends' });
    await waitFor(() => expect(h1).toHaveFocus());
    expect(document.title).toBe('Friends · Pulse');
  });

  it('opens an authenticated socket with a ticket after login', async () => {
    routeFetch(ok);
    renderAt('/');
    await screen.findByRole('navigation', { name: 'Primary' });
    await waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0));
    expect(FakeWebSocket.instances[0].url).toContain('?ticket=t');
  });

  it('the 4002 close code ends the session and returns to login', async () => {
    routeFetch(ok);
    const router = renderAt('/');
    await screen.findByRole('navigation', { name: 'Primary' });
    await waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0));
    const ws = FakeWebSocket.instances.at(-1);
    ws.serverSend('READY', { userId: 'u1', serverNow: Date.now() });
    ws.serverClose(4002);
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(tokenStore.get()).toBeNull();
  });
});
