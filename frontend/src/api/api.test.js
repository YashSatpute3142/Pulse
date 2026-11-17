import { describe, it, expect, beforeEach, vi } from 'vitest';
import { json, stubFetch, ME } from '../test/helpers.js';
import { tokenStore } from './tokenStore.js';
import { sessionEvents } from './sessionEvents.js';
import { refreshSession } from './refresh.js';
import { request, api } from './client.js';
import { ApiError } from './ApiError.js';

beforeEach(() => tokenStore.clear());

const refreshOk = (token = 'T2') => json(200, { data: { user: ME, accessToken: token } });
const unauth = (code = 'UNAUTHENTICATED') => json(401, { error: { code, message: 'no' } });

describe('refreshSession', () => {
  it('is single-flight: concurrent callers share one POST /auth/refresh', async () => {
    const f = stubFetch(refreshOk());
    const [a, b] = await Promise.all([refreshSession(), refreshSession()]);
    expect(f).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(tokenStore.get()).toBe('T2');
  });

  it('sends the cookie (credentials include) and no Authorization header', async () => {
    const f = stubFetch(refreshOk());
    await refreshSession();
    const [url, init] = f.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/auth\/refresh$/);
    expect(init.credentials).toBe('include');
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('401 clears the token and emits expired', async () => {
    tokenStore.set('old');
    const spy = vi.fn(); const off = sessionEvents.on('expired', spy);
    stubFetch(unauth());
    await expect(refreshSession()).rejects.toBeInstanceOf(ApiError);
    expect(tokenStore.get()).toBeNull();
    expect(spy).toHaveBeenCalledWith('expired');
    off();
  });

  it('TOKEN_REUSED emits expired with reason reused', async () => {
    const spy = vi.fn(); const off = sessionEvents.on('expired', spy);
    stubFetch(unauth('TOKEN_REUSED'));
    await expect(refreshSession()).rejects.toThrow();
    expect(spy).toHaveBeenCalledWith('reused');
    off();
  });

  it('a network failure does NOT end the session', async () => {
    tokenStore.set('keep');
    const spy = vi.fn(); const off = sessionEvents.on('expired', spy);
    stubFetch(new TypeError('Failed to fetch'));
    await expect(refreshSession()).rejects.toMatchObject({ code: 'NETWORK' });
    expect(tokenStore.get()).toBe('keep');
    expect(spy).not.toHaveBeenCalled();
    off();
  });

  it('allows a new refresh after the previous one settled', async () => {
    const f = stubFetch(refreshOk('A'), refreshOk('B'));
    await refreshSession(); await refreshSession();
    expect(f).toHaveBeenCalledTimes(2);
    expect(tokenStore.get()).toBe('B');
  });
});

describe('request (401 -> refresh -> retry once)', () => {
  it('attaches the in-memory bearer token', async () => {
    tokenStore.set('T1');
    const f = stubFetch(json(200, { data: { ok: 1 } }));
    const res = await api.get('/auth/me');
    expect(res.data).toEqual({ ok: 1 });
    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer T1');
  });

  it('on UNAUTHENTICATED refreshes once and retries with the new token', async () => {
    tokenStore.set('expired');
    const f = stubFetch(unauth(), refreshOk('FRESH'), json(200, { data: 'yes' }));
    const res = await api.get('/auth/me');
    expect(res.data).toBe('yes');
    expect(f).toHaveBeenCalledTimes(3);
    expect(f.mock.calls[2][1].headers.Authorization).toBe('Bearer FRESH');
  });

  it('does not loop: a second 401 after refresh is surfaced', async () => {
    tokenStore.set('x');
    const f = stubFetch(unauth(), refreshOk('N'), unauth());
    await expect(api.get('/auth/me')).rejects.toMatchObject({ status: 401 });
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('when the refresh itself fails the error propagates and no retry happens', async () => {
    tokenStore.set('x');
    const f = stubFetch(unauth(), unauth());
    await expect(api.get('/auth/me')).rejects.toMatchObject({ status: 401 });
    expect(f).toHaveBeenCalledTimes(2);
    expect(tokenStore.get()).toBeNull();
  });

  it('parallel 401s share one refresh', async () => {
    tokenStore.set('x');
    const f = stubFetch(unauth(), unauth(), refreshOk('N'), json(200, { data: 1 }), json(200, { data: 2 }));
    const [a, b] = await Promise.all([api.get('/a'), api.get('/b')]);
    expect([a.data, b.data]).toEqual([1, 2]);
    expect(f.mock.calls.filter(([u]) => u.endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('does not refresh for non-auth errors (403, 500)', async () => {
    tokenStore.set('x');
    const f = stubFetch(json(403, { error: { code: 'FORBIDDEN', message: 'no' } }));
    await expect(api.get('/x')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('auth:false never refreshes (login with bad password stays a 401)', async () => {
    const f = stubFetch(unauth());
    await expect(request('/auth/login', { method: 'POST', body: {}, auth: false })).rejects.toMatchObject({ status: 401 });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('maps 429 with Retry-After and a validation error body', async () => {
    stubFetch(json(429, { error: { code: 'RATE_LIMITED', message: 'slow' } }, { 'Retry-After': '30' }), json(400, { error: { code: 'VALIDATION_ERROR', message: 'bad', details: { fields: [{ field: 'email', message: 'Invalid' }] } } }));
    await expect(request('/a', { auth: false })).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfter: 30 });
    const err = await request('/a', { auth: false }).catch((e) => e);
    expect(err.fieldErrors).toEqual({ email: 'Invalid' });
  });

  it('204 resolves with data null', async () => {
    stubFetch(new Response(null, { status: 204 }));
    expect((await request('/auth/logout', { method: 'POST', auth: false })).data).toBeNull();
  });
});
