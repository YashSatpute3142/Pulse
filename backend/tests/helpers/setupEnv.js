// Runs in every test file BEFORE app modules are imported: points the app at the real test MongoDB
// (own database per test file) and sets the environment the zod config requires.
import crypto from 'node:crypto';
import { inject } from 'vitest';

const uri = inject('mongoUri');
const dbName = `pulse_test_${crypto.randomBytes(5).toString('hex')}`;

Object.assign(process.env, {
  NODE_ENV: 'test',
  MONGODB_URI: `${uri.replace(/\/$/, '')}/${dbName}`,
  JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef',
  JWT_REFRESH_SECRET: 'test-refresh-secret-fedcba9876543210',
  CLIENT_ORIGINS: 'http://localhost:5173',
  BCRYPT_COST: '4',
  LOG_LEVEL: 'silent',
  CLOUDINARY_CLOUD_NAME: 'testcloud',
  CLOUDINARY_API_KEY: 'test-key',
  CLOUDINARY_API_SECRET: 'test-secret',
  RATE_LIMIT_AUTH_PER_MIN: '1000',
  RATE_LIMIT_API_PER_MIN: '1000',
});
