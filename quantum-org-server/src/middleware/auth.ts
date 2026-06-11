import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config/env';

const BEARER_PREFIX = 'Bearer ';
const expectedToken = Buffer.from(config.authToken);

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith(BEARER_PREFIX)) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }

  const token = Buffer.from(header.slice(BEARER_PREFIX.length).trim());
  const valid = token.length === expectedToken.length && crypto.timingSafeEqual(token, expectedToken);
  if (!valid) {
    res.status(401).json({ error: 'Invalid auth token' });
    return;
  }

  next();
}
