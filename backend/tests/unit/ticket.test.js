// UNIT tests (no database): one-time WebSocket tickets.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { issueTicket, consumeTicket } from '../../src/services/ticket.service.js';

afterEach(() => vi.useRealTimers());

describe('ws tickets', () => {
  it('issues an unguessable ticket with the configured TTL', () => {
    const { ticket, expiresInSec } = issueTicket('abc');
    expect(ticket.length).toBeGreaterThanOrEqual(40);
    expect(expiresInSec).toBe(30);
  });
  it('works exactly once and yields the userId', () => {
    const { ticket } = issueTicket('user1');
    expect(consumeTicket(ticket)).toEqual({ userId: 'user1' });
    expect(consumeTicket(ticket)).toBeNull();
  });
  it('rejects unknown and non-string tickets', () => {
    expect(consumeTicket('nope')).toBeNull();
    expect(consumeTicket(undefined)).toBeNull();
    expect(consumeTicket({})).toBeNull();
  });
  it('expires after the TTL', () => {
    vi.useFakeTimers();
    const { ticket } = issueTicket('u');
    vi.advanceTimersByTime(31_000);
    expect(consumeTicket(ticket)).toBeNull();
  });
});
