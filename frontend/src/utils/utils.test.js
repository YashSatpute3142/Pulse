import { describe, it, expect } from 'vitest';
import { safeRedirect } from './safeRedirect.js';
import { initials, avatarTone } from './initials.js';
import { validateLogin, validateRegister } from '../features/auth/validation.js';

describe('safeRedirect', () => {
  it.each([
    ['/messages/abc', '/messages/abc'], ['/', '/'], ['/settings?x=1', '/settings?x=1'],
    ['//evil.com', '/'], ['https://evil.com', '/'], ['/\\evil.com', '/'], ['javascript:alert(1)', '/'],
    ['/login', '/'], ['/register', '/'], [undefined, '/'], [42, '/'],
  ])('%s -> %s', (input, expected) => expect(safeRedirect(input)).toBe(expected));
});

describe('initials / avatarTone', () => {
  it('builds initials and a stable tone 1..6', () => {
    expect(initials('Meera Rao')).toBe('MR');
    expect(initials('thesis')).toBe('TH');
    expect(initials('')).toBe('?');
    const t = avatarTone('Meera Rao');
    expect(t).toBeGreaterThanOrEqual(1); expect(t).toBeLessThanOrEqual(6);
    expect(avatarTone('Meera Rao')).toBe(t);
  });
});

describe('auth validation', () => {
  it('login requires both fields', () => {
    expect(validateLogin({ identifier: ' ', password: '' })).toEqual({ identifier: expect.any(String), password: expect.any(String) });
    expect(validateLogin({ identifier: 'a', password: 'b' })).toEqual({});
  });
  it('register follows the contract rules', () => {
    const ok = { displayName: 'A', username: 'aarav_1', email: 'a@b.co', password: 'longenough' };
    expect(validateRegister(ok)).toEqual({});
    expect(validateRegister({ ...ok, username: 'ab' }).username).toBeTruthy();
    expect(validateRegister({ ...ok, username: 'has space' }).username).toBeTruthy();
    expect(validateRegister({ ...ok, password: 'short' }).password).toBeTruthy();
    expect(validateRegister({ ...ok, password: 'x'.repeat(73) }).password).toBeTruthy();
    expect(validateRegister({ ...ok, password: 'aarav_1' }).password).toBeTruthy();
    expect(validateRegister({ ...ok, email: 'nope' }).email).toBeTruthy();
  });
});
