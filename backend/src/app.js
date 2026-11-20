import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { requestId } from './middleware/requestId.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { apiRoutes } from './routes/index.js';
import { healthRoutes } from './routes/health.routes.js';

/** Express app only (no listening, no WebSocket). `limits` lets tests override rate limits without touching env. */
export function createApp({ limits } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(requestId);
  app.use(pinoHttp({ logger, genReqId: (req) => req.id, autoLogging: { ignore: (req) => req.url.endsWith('/health') } }));
  app.use(helmet());
  app.use(cors({
    origin(origin, cb) {
      // No Origin header = non-browser client / same-origin; browsers cross-origin must be on the allowlist.
      if (!origin || env.CLIENT_ORIGINS_LIST.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    exposedHeaders: ['Retry-After', 'X-Request-Id'],
    maxAge: 600,
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use(healthRoutes); // plain /health for platform health checks (Render)
  app.use('/api/v1', apiRoutes(limits));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
