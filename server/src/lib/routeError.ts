import { Response } from 'express';

/**
 * Logs the real error to the console and returns a generic 500 to the client.
 * Prevents internal DB details (table names, column names) leaking to the renderer.
 */
export function routeError(res: Response, e: unknown): void {
  console.error('[route error]', e);
  res.status(500).json({ error: 'Internal server error' });
}
