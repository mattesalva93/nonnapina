import { describe, expect, it, vi } from 'vitest';

vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  createComponentLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../config/index.js', () => ({
  config: {
    server: { nodeEnv: 'test' },
  },
}));

vi.mock('../services/email.service.js', () => ({
  sendErrorAlert: vi.fn(),
}));

import { errorHandler } from './error-handler.js';

function createMockReq() {
  return {
    id: 'req-123',
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

describe('errorHandler', () => {
  it('responds with 500 and error message in non-production', () => {
    const req = createMockReq();
    const res = createMockRes();

    errorHandler(new Error('Something broke'), req, res, vi.fn());

    expect(res.statusCode).toBe(500);
    expect(res._jsonBody.error).toBe('Internal Server Error');
    expect(res._jsonBody.message).toBe('Something broke');
  });

  it('hides error message in production', async () => {
    // Dynamically override config for production test
    const { config } = await import('../config/index.js');
    const original = config.server.nodeEnv;
    (config.server as any).nodeEnv = 'production';

    const req = createMockReq();
    const res = createMockRes();

    errorHandler(new Error('Secret error'), req, res, vi.fn());

    expect(res.statusCode).toBe(500);
    expect(res._jsonBody.error).toBe('Internal Server Error');
    expect(res._jsonBody.message).toBeUndefined();

    (config.server as any).nodeEnv = original;
  });
});
