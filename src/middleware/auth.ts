import type { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { config } from '../config/index.js';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('Auth');

/**
 * Compares two strings in constant time to prevent timing attacks.
 * Returns false if either string is empty.
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length === 0 || b.length === 0) return false;

  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  if (bufA.length !== bufB.length) return false;

  return timingSafeEqual(bufA, bufB);
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const apiSecret = config.server.apiSecret;

  if (!apiSecret) {
    logger.warn('API_SECRET is not configured — all requests are allowed');
    next();
    return;
  }

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: 'Unauthorized', message: 'Missing Authorization header' });
    return;
  }

  const [scheme, token] = authHeader.split(' ', 2);

  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid Authorization format. Use: Bearer <token>' });
    return;
  }

  if (!safeCompare(token, apiSecret)) {
    logger.warn({ method: req.method, url: req.originalUrl }, 'Invalid API token');
    res.status(403).json({ error: 'Forbidden', message: 'Invalid API token' });
    return;
  }

  next();
}
