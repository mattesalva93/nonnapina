import type { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';

declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers['x-request-id'] as string) ?? crypto.randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}
