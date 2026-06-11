import path from 'path';
import express from 'express';
import helmet from 'helmet';
import { config } from './config/env';
import { initDb } from './db';
import { requireAuth } from './middleware/auth';
import { apiLimiter, uploadLimiter, healthLimiter } from './middleware/rateLimit';
import { logger } from './lib/logger';
import { startAggregationJob } from './jobs/aggregateStats';
import { startCleanupJob } from './jobs/cleanupOldData';

import healthRouter      from './routes/health';
import uploadRouter      from './routes/upload';
import membersRouter     from './routes/members';
import statsRouter       from './routes/stats';
import blueprintsRouter  from './routes/blueprints';
import leaderboardRouter from './routes/leaderboard';
import settingsRouter    from './routes/settings';

async function main(): Promise<void> {
  await initDb();

  const app = express();

  app.use(helmet());
  app.use(express.json({ limit: '10mb' }));

  app.use((req, _res, next) => {
    logger.info(`${req.method} ${req.path}`);
    next();
  });

  // Admin dashboard (static; the dashboard itself authenticates against the API with a bearer token)
  app.use(express.static(path.join(__dirname, '../public')));

  // Unauthenticated
  app.use('/api/health', healthLimiter, healthRouter);

  // Authenticated + rate-limited
  app.use('/api/upload',      uploadLimiter, requireAuth, uploadRouter);
  app.use('/api/members',     apiLimiter,    requireAuth, membersRouter);
  app.use('/api/stats',       apiLimiter,    requireAuth, statsRouter);
  app.use('/api/blueprints',  apiLimiter,    requireAuth, blueprintsRouter);
  app.use('/api/leaderboard', apiLimiter,    requireAuth, leaderboardRouter);
  app.use('/api/settings',   apiLimiter,    requireAuth, settingsRouter);

  // Global error handler — never leak internal details to the client
  app.use((err: any, _req: any, res: any, _next: any) => {
    logger.error('[unhandled error]', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  app.listen(config.port, () => {
    logger.info(`Quantum Org Server listening on port ${config.port}`);
    logger.info(`Server ID: ${config.serverId}`);
    logger.info(`Auth token is stored in .env (AUTH_TOKEN) — share it with org members so they can configure the desktop app.`);
  });

  // Background jobs
  startAggregationJob();
  startCleanupJob();
}

main().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});
