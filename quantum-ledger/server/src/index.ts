import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { initDb, db } from './db';
import { startLogMonitor, stopLogMonitor } from './lib/logMonitor';

import gamesRouter from './routes/games';
import crewRouter from './routes/crew';
import vehiclesRouter from './routes/vehicles';
import runsRouter from './routes/runs';
import miningRouter from './routes/mining';
import tradingRouter from './routes/trading';
import salesRouter from './routes/sales';
import craftingRouter from './routes/crafting';
import contractsRouter from './routes/contracts';
import haulingRouter from './routes/hauling';
import locationsRouter from './routes/locations';
import expensesRouter from './routes/expenses';
import inventoryRouter from './routes/inventory';
import accountingRouter from './routes/accounting';
import salvageRouter from './routes/salvage';
import blueprintsRouter from './routes/blueprints';
import settingsRouter from './routes/settings';
import clanRouter from './routes/clan';

export async function startServer(port?: number, clientDist?: string): Promise<void> {
  const app = express();
  const listenPort = port ?? Number(process.env.PORT ?? 3001);

  app.use(cors({ origin: `http://localhost:${listenPort}` }));
  app.use(express.json());

  // Defence-in-depth: this server has no auth and binds to loopback only, but
  // any local process or webpage can still reach it. Browsers cannot attach
  // custom headers to cross-site requests without a CORS preflight, which the
  // origin restriction above will reject — so this blocks "blind" cross-site
  // requests (CSRF-style) from a malicious page open in the user's browser.
  app.use('/api', (req, res, next) => {
    if (req.path === '/health' || req.headers['x-quantum-ledger'] === '1') {
      return next();
    }
    res.status(403).json({ error: 'Forbidden' });
  });

  // Restrict the renderer to same-origin resources by default.
  app.use((_req, res, next) => {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    );
    next();
  });

  app.use('/api/games', gamesRouter);
  app.use('/api/crew', crewRouter);
  app.use('/api/vehicles', vehiclesRouter);
  app.use('/api/runs', runsRouter);
  app.use('/api/mining', miningRouter);
  app.use('/api/trading', tradingRouter);
  app.use('/api/sales', salesRouter);
  app.use('/api/crafting', craftingRouter);
  app.use('/api/contracts', contractsRouter);
  app.use('/api/hauling', haulingRouter);
  app.use('/api/locations', locationsRouter);
  app.use('/api/expenses', expensesRouter);
  app.use('/api/inventory', inventoryRouter);
  app.use('/api/accounting', accountingRouter);
  app.use('/api/salvage', salvageRouter);
  app.use('/api/blueprints', blueprintsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/clan', clanRouter);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // Global error handler — never leak internal details to the client
  app.use((err: any, _req: any, res: any, _next: any) => {
    console.error('[server error]', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  // Serve the built React app in production (when clientDist is provided)
  const staticDir = clientDist ?? process.env.CLIENT_DIST;
  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
    // SPA fallback — all non-API routes return index.html
    app.get('*', (_req, res) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  await initDb();

  // Start Game.log monitoring for the default Star Citizen game and path saved in settings
  try {
    const defaultGame = await db.get('SELECT id FROM games WHERE name = ? LIMIT 1', ['Star Citizen']);
    const setting = await db.get('SELECT value FROM settings WHERE key = ?', ['logPath']);
    const logPath = setting?.value ?? undefined;
    if (defaultGame) {
      await startLogMonitor(defaultGame.id, logPath);
    }
  } catch (err) {
    console.error('[server] Failed to start log monitor:', err);
  }

  return new Promise((resolve, reject) => {
    const server = app.listen(listenPort, '127.0.0.1', () => {
      console.log(`Quantum Ledger API running on http://127.0.0.1:${listenPort}`);
      resolve();
    });
    server.on('error', reject);
    server.on('close', () => {
      stopLogMonitor();
    });
  });
}

// Auto-start when executed directly (dev mode)
if (require.main === module) {
  startServer().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  stopLogMonitor();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopLogMonitor();
  process.exit(0);
});
