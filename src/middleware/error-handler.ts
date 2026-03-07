import type { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger.js';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  logger.error({ err: err.message, stack: err.stack }, 'Unhandled error');
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
  });
}
