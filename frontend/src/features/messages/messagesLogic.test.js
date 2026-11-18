import { describe, it, expect, vi } from 'vitest';
import { applyDeleted, makeOptimistic, patchByClientId, removeByClientId, selectMessages, tempId, toggleReaction, upsertMessage } from './cache.js';
import { createOutbox } from './outbox.js';

const msg = (id, extra = {}) => ({ id, conversationId: 'c1', senderId: 'u2', type: 'text', text: id, attachments: [], reactions: [], replyTo: null, editedAt: null, deletedAt: null, createdAt: '2026-11-17T10:00:00.000Z', ...extra });
// pages newest-first
const data = () => ({ pages: [{ data: [msg('m3'), msg('m2')], meta: {} }, { data: [msg('m1')], meta: {} }], pageParams: [undefined, 'm2'] });

describe('message cache helpers', () => {
  it('selectMessages returns ascending order across pages and drops duplicates', () => {
    const d = data(); d.pages[1].data.push(msg('m2'));
    expect(selectMessages(d).map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
  });
  it('upsert inserts a new message at the newest end of page 0', () => {
    expect(selectMessages(upsertMessage(data(), msg('m4'))).map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
  });
  it('upsert replaces an existing id and swaps the optimistic row by clientId (no duplicate)', () => {
    const opt = makeOptimistic({ clientId: 'k1', conversationId: 'c1', senderId: 'u1', text: 'hi' });
    const withOpt = upsertMessage(data(), opt);
    expect(selectMessages(withOpt).at(-1)).toMatchObject({ id: tempId('k1'), _status: 'sending' });
    const real = msg('m9', { senderId: 'u1', text: 'hi', clientId: 'k1' });
    const after = upsertMessage(withOpt, real);
    const list = selectMessages(after);
    expect(list.filter((m) => m.clientId === 'k1')).toHaveLength(1);
    expect(list.at(-1)).toMatchObject({ id: 'm9' });
    expect(list.at(-1)._status).toBeUndefined();
    expect(selectMessages(upsertMessage(after, { ...real, text: 'edited' })).at(-1).text).toBe('edited');
  });
  it('does nothing when the conversation has no cached pages', () => {
    expect(upsertMessage(undefined, msg('m1'))).toBeUndefined();
    expect(upsertMessage({ pages: [], pageParams: [] }, msg('m1')).pages).toEqual([]);
  });
  it('patch by clientId marks failed; remove only removes optimistic rows', () => {
    const opt = makeOptimistic({ clientId: 'k1', conversationId: 'c1', senderId: 'u1', text: 'hi' });
    let d = upsertMessage(data(), opt);
    d = patchByClientId(d, 'k1', { _status: 'failed', _error: 'x' });
    expect(selectMessages(d).at(-1)._status).toBe('failed');
    expect(selectMessages(removeByClientId(d, 'k1')).map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    const real = msg('m5', { clientId: 'k2' });
    expect(selectMessages(removeByClientId(upsertMessage(data(), real), 'k2')).some((m) => m.id === 'm5')).toBe(true);
  });
  it('applyDeleted clears content', () => {
    const m = selectMessages(applyDeleted(data(), 'm2', '2026-11-17T11:00:00.000Z')).find((x) => x.id === 'm2');
    expect(m).toMatchObject({ text: '', deletedAt: '2026-11-17T11:00:00.000Z', reactions: [] });
  });
  it('toggleReaction adds, joins, and removes empty chips', () => {
    let r = toggleReaction([], '🔥', 'u1', true);
    r = toggleReaction(r, '🔥', 'u2', true);
    expect(r).toEqual([{ emoji: '🔥', userIds: ['u1', 'u2'] }]);
    r = toggleReaction(r, '🔥', 'u1', true); // idempotent
    expect(r[0].userIds).toEqual(['u1', 'u2']);
    r = toggleReaction(toggleReaction(r, '🔥', 'u1', false), '🔥', 'u2', false);
    expect(r).toEqual([]);
  });
  it('optimistic reply preview is truncated to 120 chars', () => {
    const o = makeOptimistic({ clientId: 'k', conversationId: 'c', senderId: 'u', text: 'a', replyTo: msg('m1', { text: 'x'.repeat(300) }) });
    expect(o.replyTo.text).toHaveLength(120);
  });
});

describe('outbox', () => {
  const setup = (send, ttlMs = 30000) => {
    vi.useFakeTimers();
    const statuses = []; const acks = [];
    const box = createOutbox({ send, onAck: (c, m) => acks.push(m), onStatus: (c, k, s, e) => statuses.push([k, s, e]), ttlMs });
    return { box, statuses, acks };
  };
  const payload = { text: 'hi' };

  it('sends CHAT_MESSAGE with conversationId and clientId and acks the stored message', async () => {
    const send = vi.fn(async () => ({ message: { id: 'm1', clientId: 'k1' } }));
    const { box, acks, statuses } = setup(send);
    box.enqueue({ conversationId: 'c1', clientId: 'k1', payload });
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledWith('CHAT_MESSAGE', { text: 'hi', conversationId: 'c1', clientId: 'k1' });
    expect(acks).toEqual([{ id: 'm1', clientId: 'k1' }]);
    expect(statuses[0]).toEqual(['k1', 'sending', null]);
    expect(box.size()).toBe(0);
    vi.useRealTimers();
  });

  it('queues while offline, flushes when the socket opens, and never double-sends', async () => {
    let open = false;
    const send = vi.fn(async () => { if (!open) throw Object.assign(new Error('Not connected'), { code: 'NOT_CONNECTED' }); return { message: { id: 'm1', clientId: 'k1' } }; });
    const { box, acks } = setup(send);
    box.enqueue({ conversationId: 'c1', clientId: 'k1', payload });
    await vi.advanceTimersByTimeAsync(5000);
    expect(box.size()).toBe(1); expect(acks).toHaveLength(0);
    open = true; box.flush(); box.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(acks).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(2); // one failed attempt + one success
    vi.useRealTimers();
  });

  it('marks failed after 30 s offline, then retry() resends the same clientId', async () => {
    let open = false;
    const send = vi.fn(async () => { if (!open) throw Object.assign(new Error('Not connected'), { code: 'NOT_CONNECTED' }); return { message: { id: 'm1', clientId: 'k1' } }; });
    const { box, statuses, acks } = setup(send);
    box.enqueue({ conversationId: 'c1', clientId: 'k1', payload });
    await vi.advanceTimersByTimeAsync(30001);
    expect(statuses.at(-1)).toEqual(['k1', 'failed', 'Not delivered']);
    expect(box.hasFailed('k1')).toBe(true);
    open = true; box.retry('k1');
    await vi.advanceTimersByTimeAsync(0);
    expect(acks).toHaveLength(1);
    expect(send.mock.calls.at(-1)[1].clientId).toBe('k1');
    vi.useRealTimers();
  });

  it('a server ERROR fails immediately with the message and is not auto-retried', async () => {
    const send = vi.fn(async () => { throw Object.assign(new Error('Not a member'), { code: 'FORBIDDEN' }); });
    const { box, statuses } = setup(send);
    box.enqueue({ conversationId: 'c1', clientId: 'k1', payload });
    await vi.advanceTimersByTimeAsync(0);
    expect(statuses.at(-1)).toEqual(['k1', 'failed', 'Not a member']);
    box.flush(); await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('connection closed mid-flight stays queued; discard removes it', async () => {
    const send = vi.fn(async () => { throw new Error('Connection closed'); });
    const { box } = setup(send);
    box.enqueue({ conversationId: 'c1', clientId: 'k1', payload });
    await vi.advanceTimersByTimeAsync(10);
    expect(box.size()).toBe(1);
    box.discard('k1');
    expect(box.size()).toBe(0);
    vi.useRealTimers();
  });
});
