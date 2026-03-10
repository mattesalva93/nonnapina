import type { NextFunction, Request, Response } from 'express';
import { config } from '../config/index.js';
import { sendErrorAlert } from '../services/email.service.js';
import { logger } from '../utils/logger.js';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  logger.error(
    {
      requestId: req.id,
      err: err.message,
      stack: err.stack,
      method: req.method,
      url: req.originalUrl,
      component: 'ExpressErrorHandler',
    },
    'Unhandled error'
  );

  void sendErrorAlert({
    errorMessage: err.message,
    errorStack: err.stack,
    component: 'ExpressErrorHandler',
    severity: 'error',
    endpoint: req.originalUrl,
    httpMethod: req.method,
    httpStatus: 500,
  });

  const isProduction = config.server.nodeEnv === 'production';
  res.status(500).json({
    error: 'Internal Server Error',
    ...(isProduction ? {} : { message: err.message }),
  });
}
