import { z } from 'zod';
import { LIMITS } from '../constants/limits.js';
import { passwordRule } from './auth.validators.js';

export const searchQuery = z.object({ q: z.string().max(40).default('') });

const httpsUrl = z.string().trim().max(500).url('Enter a valid URL.').refine((u) => u.startsWith('https://'), 'Use an https URL.');

export const updateProfileBody = z.object({
  displayName: z.string().trim().min(1, 'Enter your name.').max(LIMITS.DISPLAY_NAME_MAX).optional(),
  bio: z.string().trim().max(LIMITS.BIO_MAX).optional(),
  avatarUrl: httpsUrl.nullable().optional(),
}).strict().refine((v) => Object.keys(v).length > 0, 'Nothing to update.');

export const updateSettingsBody = z.object({
  theme: z.enum(['system', 'dark', 'light']).optional(),
  activityVisibility: z.enum(['everyone', 'friends', 'nobody']).optional(),
  showPresence: z.boolean().optional(),
  showReadReceipts: z.boolean().optional(),
}).strict().refine((v) => Object.keys(v).length > 0, 'Nothing to update.');

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.').max(200),
  newPassword: passwordRule,
});
