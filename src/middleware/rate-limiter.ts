import type { NextFunction, Request, Response } from 'express';

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 100;

interface RateBucket {
  count: number;
  resetAt: number;
}

const hits = new Map<string, RateBucket>();

// Periodically prune expired entries to prevent unbounded memory growth
const pruneInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of hits) {
    if (now >= entry.resetAt) hits.delete(key);
  }
}, 5 * 60_000);

// Allow the timer to not prevent clean process shutdown
pruneInterval.unref();

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const key = req.ip ?? 'unknown';
  const now = Date.now();

  let entry = hits.get(key);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    hits.set(key, entry);
  }

  entry.count++;

  res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, MAX_REQUESTS - entry.count));
  res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

  if (entry.count > MAX_REQUESTS) {
    res.status(429).json({ error: 'Too Many Requests' });
    return;
  }

  next();
}
