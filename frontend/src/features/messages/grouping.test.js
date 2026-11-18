import { describe, it, expect } from 'vitest';
import { buildItems, canDelete, canEdit, seenByCount } from './grouping.js';

const at = (h, m = 0, d = 17) => new Date(2026, 10, d, h, m).toISOString();
const m = (id, senderId, time, extra = {}) => ({ id, senderId, createdAt: time, type: 'text', text: id, ...extra });
const now = new Date(2026, 10, 17, 20, 0);

describe('buildItems', () => {
  it('groups same-sender messages within 5 minutes and marks only the last of a group', () => {
    const items = buildItems([m('1', 'a', at(9, 0)), m('2', 'a', at(9, 3)), m('3', 'a', at(9, 9)), m('4', 'b', at(9, 10))], 'me', now);
    const rows = items.filter((i) => i.type === 'msg');
    expect(rows.map((r) => [r.message.id, r.first, r.last])).toEqual([['1', true, false], ['2', false, true], ['3', true, true], ['4', true, true]]);
  });
  it('inserts a date separator per day and breaks groups across days and system lines', () => {
    const items = buildItems([m('1', 'a', at(23, 58, 16)), m('2', 'a', at(0, 1, 17)), m('s', null, at(0, 2, 17), { type: 'system' }), m('3', 'a', at(0, 3, 17))], 'me', now);
    expect(items.map((i) => i.type)).toEqual(['date', 'msg', 'date', 'msg', 'system', 'msg']);
    expect(items.filter((i) => i.type === 'date').map((d) => d.label)).toEqual(['Yesterday', 'Today']);
    const rows = items.filter((i) => i.type === 'msg');
    expect(rows.map((r) => r.first)).toEqual([true, true, true]);
  });
  it('marks own rows and keys optimistic rows by clientId so the server copy keeps the node', () => {
    const [, row] = buildItems([m('tmp-k', 'me', at(9), { clientId: 'k' })], 'me', now);
    expect(row.own).toBe(true); expect(row.key).toBe('k');
    const [, real] = buildItems([m('abc', 'me', at(9), { clientId: 'k' })], 'me', now);
    expect(real.key).toBe('k');
  });
});

describe('seenByCount', () => {
  const rs = [{ userId: 'me', lastReadMessageId: '5' }, { userId: 'a', lastReadMessageId: '3' }, { userId: 'b', lastReadMessageId: '1' }, { userId: 'c', lastReadMessageId: null }];
  it('counts other members whose pointer reached the message', () => {
    expect(seenByCount({ id: '3' }, rs, 'me')).toBe(1);
    expect(seenByCount({ id: '1' }, rs, 'me')).toBe(2);
    expect(seenByCount({ id: '9' }, rs, 'me')).toBe(0);
  });
  it('is zero for optimistic rows and when read-state is not loaded', () => {
    expect(seenByCount({ id: 'tmp-x' }, rs, 'me')).toBe(0);
    expect(seenByCount({ id: '3' }, undefined, 'me')).toBe(0);
  });
});

describe('permissions', () => {
  const base = { senderId: 'me', type: 'text', deletedAt: null, createdAt: new Date().toISOString() };
  it('edit: own text within 24 h only', () => {
    expect(canEdit(base, 'me')).toBe(true);
    expect(canEdit({ ...base, senderId: 'x' }, 'me')).toBe(false);
    expect(canEdit({ ...base, createdAt: new Date(Date.now() - 25 * 3600e3).toISOString() }, 'me')).toBe(false);
    expect(canEdit({ ...base, deletedAt: 'x' }, 'me')).toBe(false);
    expect(canEdit({ ...base, _status: 'sending' }, 'me')).toBe(false);
    expect(canEdit({ ...base, type: 'image' }, 'me')).toBe(false);
  });
  it('delete: own, or admin/owner of the group; never system or pending', () => {
    expect(canDelete(base, 'me', 'member')).toBe(true);
    expect(canDelete({ ...base, senderId: 'x' }, 'me', 'member')).toBe(false);
    expect(canDelete({ ...base, senderId: 'x' }, 'me', 'admin')).toBe(true);
    expect(canDelete({ ...base, senderId: 'x' }, 'me', 'owner')).toBe(true);
    expect(canDelete({ ...base, type: 'system' }, 'me', 'owner')).toBe(false);
    expect(canDelete({ ...base, _status: 'failed' }, 'me', 'owner')).toBe(false);
  });
});
