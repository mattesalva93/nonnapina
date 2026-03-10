import type { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger.js';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SENSITIVE_KEYS = new Set(['password', 'secret', 'token', 'apikey', 'authorization']);

function sanitizeBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return undefined;
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    sanitized[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : value;
  }
  return sanitized;
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Skip verbose health check logs
  if (req.originalUrl === '/health') {
    return next();
  }

  const start = Date.now();
  res.on('finish', () => {
    const logData: Record<string, unknown> = {
      requestId: req.id,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - start,
      ip: req.ip ?? req.socket.remoteAddress,
    };

    if (
      MUTATION_METHODS.has(req.method) &&
      req.body &&
      Object.keys(req.body as object).length > 0
    ) {
      logData.body = sanitizeBody(req.body);
    }

    logger.info(logData);
  });
  next();
}
