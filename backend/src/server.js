import http from 'node:http';
import { env } from './config/env.js';
import { connectDb, disconnectDb } from './config/db.js';
import { createApp } from './app.js';
import { createWsServer } from './ws/index.js';
import { logger } from './utils/logger.js';

export async function startServer() {
  await connectDb();
  const app = createApp();
  const server = http.createServer(app);

  const wsServer = createWsServer(server); // native ws on the same http.Server (Chat 04)

  await new Promise((resolve) => server.listen(env.PORT, resolve));
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'pulse backend listening');

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, 'shutting down');
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    await wsServer.close();
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
    server.closeIdleConnections?.();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  return server;
}

startServer().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  console.error(err);
  process.exit(1);
});
