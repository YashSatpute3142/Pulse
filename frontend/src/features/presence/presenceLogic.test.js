import { describe, it, expect, vi, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { applyPresence, applySnapshot } from './presenceCache.js';
import { setTyping, getTyping, clearAllTyping } from './typingStore.js';
import { queryKeys } from '../../api/queryKeys.js';

afterEach(() => { clearAllTyping(); vi.useRealTimers(); });

describe('presenceCache', () => {
  it('applies updates, rejects invalid statuses, and a snapshot replaces everything', () => {
    const qc = new QueryClient();
    applyPresence(qc, { userId: 'a', status: 'online' });
    applyPresence(qc, { userId: 'b', status: 'bogus' });
    applyPresence(qc, { status: 'online' });
    expect(qc.getQueryData(queryKeys.presence())).toEqual({ a: { status: 'online', lastSeenAt: undefined } });
    applySnapshot(qc, [{ userId: 'c', status: 'away' }]);
    expect(Object.keys(qc.getQueryData(queryKeys.presence()))).toEqual(['c']);
    applySnapshot(qc, null); applySnapshot(qc, 'x');
    expect(Object.keys(qc.getQueryData(queryKeys.presence()))).toEqual(['c']);
  });
});

describe('typingStore', () => {
  it('keeps a stable snapshot until something changes and expires after 6 s', () => {
    vi.useFakeTimers();
    expect(getTyping('c1')).toBe(getTyping('c1'));
    setTyping('c1', 'u2', true);
    const first = getTyping('c1');
    expect(first).toEqual(['u2']);
    setTyping('c1', 'u2', true); // refresh only
    expect(getTyping('c1')).toBe(first);
    vi.advanceTimersByTime(5900);
    expect(getTyping('c1')).toEqual(['u2']);
    setTyping('c1', 'u2', true); // server re-sent: timer restarts
    vi.advanceTimersByTime(5900);
    expect(getTyping('c1')).toEqual(['u2']);
    vi.advanceTimersByTime(200);
    expect(getTyping('c1')).toEqual([]);
  });
});
