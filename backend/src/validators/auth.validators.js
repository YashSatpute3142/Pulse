import { z } from 'zod';
import { LIMITS } from '../constants/limits.js';

// API_CONTRACT 4.1. Username 3-24 [a-z0-9_] (case-insensitive unique); password 8-72, not equal to username/email.
const username = z.string().trim()
  .regex(new RegExp(`^[A-Za-z0-9_]{${LIMITS.USERNAME_MIN},${LIMITS.USERNAME_MAX}}$`), 'Use 3 to 24 letters, numbers or underscores.');
const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.').max(254));
const displayName = z.string().trim().min(1, 'Enter your name.').max(LIMITS.DISPLAY_NAME_MAX, `Use at most ${LIMITS.DISPLAY_NAME_MAX} characters.`);

export const passwordRule = z.string()
  .min(LIMITS.PASSWORD_MIN, `Use ${LIMITS.PASSWORD_MIN} to ${LIMITS.PASSWORD_MAX} characters.`)
  .max(LIMITS.PASSWORD_MAX, `Use ${LIMITS.PASSWORD_MIN} to ${LIMITS.PASSWORD_MAX} characters.`)
  .refine((p) => Buffer.byteLength(p, 'utf8') <= 72, 'Password is too long (72 bytes max).'); // bcrypt truncates beyond 72 bytes

export const registerBody = z.object({ username, email, password: passwordRule, displayName })
  .superRefine((v, ctx) => {
    const p = v.password.toLowerCase();
    if (p === v.username.toLowerCase() || p === v.email) {
      ctx.addIssue({ code: 'custom', path: ['password'], message: 'Password cannot match your username or email.' });
    }
  });

export const loginBody = z.object({
  identifier: z.string().trim().min(1, 'Enter your email or username.').max(254),
  password: z.string().min(1, 'Enter your password.').max(200),
});
