import dns from 'node:dns';
import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

mongoose.set('strictQuery', true);

if (env.DNS_SERVERS) dns.setServers(env.DNS_SERVERS.split(',').map((s) => s.trim()).filter(Boolean));

export async function connectDb(uri = env.MONGODB_URI) {
  mongoose.connection.on('error', (err) => logger.error({ err }, 'mongo connection error'));
  mongoose.connection.on('disconnected', () => logger.warn('mongo disconnected'));
  await mongoose.connect(uri, {
    autoIndex: !env.IS_PROD, // production: indexes are synced by `npm run db:sync-indexes` at deploy
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 8000,
    retryWrites: true,
  });
  logger.info('mongo connected');
  return mongoose.connection;
}

export async function disconnectDb() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}

/** 'up' only when the driver is connected and answers a ping. */
export async function dbStatus() {
  try {
    if (mongoose.connection.readyState !== 1) return 'down';
    await mongoose.connection.db.admin().ping();
    return 'up';
  } catch {
    return 'down';
  }
}
