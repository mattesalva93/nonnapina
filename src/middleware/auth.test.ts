import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock factories are hoisted — use vi.hoisted for shared state
const mockConfig = vi.hoisted(() => ({
  server: {
    apiSecret: 'test-secret-token-12345',
    nodeEnv: 'test',
    port: 3000,
    cronSchedule: '15 8,20 * * *',
  },
}));

vi.mock('../config/index.js', () => ({
  config: mockConfig,
}));

vi.mock('../utils/logger.js', () => ({
  createComponentLogger: () => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { authMiddleware } from './auth.js';

function createMockReq(headers: Record<string, string> = {}) {
  return {
    headers,
    method: 'GET',
    originalUrl: '/api/test',
  } as any;
}

function createMockRes() {
  const res: any = {
    statusCode: 200,
    _jsonBody: undefined,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: any) {
      res._jsonBody = body;
      return res;
    },
  };
  return res;
}

describe('authMiddleware', () => {
  const next = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.server.apiSecret = 'test-secret-token-12345';
  });

  it('allows requests with valid Bearer token', () => {
    const req = createMockReq({ authorization: 'Bearer test-secret-token-12345' });
    const res = createMockRes();

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  it('rejects requests without Authorization header', () => {
    const req = createMockReq();
    const res = createMockRes();

    authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res._jsonBody.error).toBe('Unauthorized');
  });

  it('rejects requests with invalid token', () => {
    const req = createMockReq({ authorization: 'Bearer wrong-token' });
    const res = createMockRes();

    authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res._jsonBody.error).toBe('Forbidden');
  });

  it('rejects requests with non-Bearer scheme', () => {
    const req = createMockReq({ authorization: 'Basic dXNlcjpwYXNz' });
    const res = createMockRes();

    authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res._jsonBody.message).toContain('Invalid Authorization format');
  });

  it('rejects requests with Bearer scheme but no token', () => {
    const req = createMockReq({ authorization: 'Bearer' });
    const res = createMockRes();

    authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('allows all requests when API_SECRET is not configured', () => {
    mockConfig.server.apiSecret = '';

    const req = createMockReq(); // No auth header
    const res = createMockRes();

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects tokens of different length (timing-safe)', () => {
    const req = createMockReq({ authorization: 'Bearer short' });
    const res = createMockRes();

    authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });
});
