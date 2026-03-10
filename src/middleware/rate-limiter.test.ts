import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rateLimiter } from './rate-limiter.js';

function createMockReq(ip = '127.0.0.1') {
  return { ip } as any;
}

function createMockRes() {
  const headers: Record<string, string | number> = {};
  const res: any = {
    statusCode: 200,
    _jsonBody: undefined,
    setHeader(name: string, value: string | number) {
      headers[name] = value;
    },
    getHeader(name: string) {
      return headers[name];
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: any) {
      res._jsonBody = body;
      return res;
    },
    _headers: headers,
  };
  return res;
}

describe('rateLimiter', () => {
  const next = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows requests under the limit and sets rate-limit headers', () => {
    const ip = `test-ip-${Date.now()}`;
    const req = createMockReq(ip);
    const res = createMockRes();

    rateLimiter(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res._headers['X-RateLimit-Limit']).toBe(100);
    expect(res._headers['X-RateLimit-Remaining']).toBe(99);
    expect(res._headers['X-RateLimit-Reset']).toBeDefined();
  });

  it('blocks requests exceeding the limit with 429', () => {
    const ip = `flood-${Date.now()}`;

    for (let i = 0; i < 101; i++) {
      const req = createMockReq(ip);
      const res = createMockRes();
      rateLimiter(req, res, vi.fn());
    }

    // The 102nd request should be blocked
    const req = createMockReq(ip);
    const res = createMockRes();
    const blocked = vi.fn();
    rateLimiter(req, res, blocked);

    expect(blocked).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(429);
    expect(res._jsonBody.error).toBe('Too Many Requests');
  });

  it('tracks different IPs separately', () => {
    const ip1 = `ip1-${Date.now()}`;
    const ip2 = `ip2-${Date.now()}`;

    const req1 = createMockReq(ip1);
    const res1 = createMockRes();
    const next1 = vi.fn();
    rateLimiter(req1, res1, next1);

    const req2 = createMockReq(ip2);
    const res2 = createMockRes();
    const next2 = vi.fn();
    rateLimiter(req2, res2, next2);

    expect(next1).toHaveBeenCalled();
    expect(next2).toHaveBeenCalled();
    // Both should have full remaining
    expect(res1._headers['X-RateLimit-Remaining']).toBe(99);
    expect(res2._headers['X-RateLimit-Remaining']).toBe(99);
  });

  it('sets remaining to 0 when limit reached', () => {
    const ip = `exact-${Date.now()}`;

    let lastRes: any;
    for (let i = 0; i < 100; i++) {
      const req = createMockReq(ip);
      lastRes = createMockRes();
      rateLimiter(req, lastRes, vi.fn());
    }

    expect(lastRes._headers['X-RateLimit-Remaining']).toBe(0);
  });
});
