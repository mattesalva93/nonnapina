import { describe, expect, it, vi } from 'vitest';
import { requestId } from './request-id.js';

function createMockReq(headers: Record<string, string> = {}) {
  return { headers } as any;
}

function createMockRes() {
  const headers: Record<string, string> = {};
  return {
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    _headers: headers,
  } as any;
}

describe('requestId', () => {
  const next = vi.fn();

  it('generates a UUID when no X-Request-Id header is present', () => {
    const req = createMockReq();
    const res = createMockRes();

    requestId(req, res, next);

    expect(req.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(res._headers['X-Request-Id']).toBe(req.id);
    expect(next).toHaveBeenCalled();
  });

  it('uses the provided X-Request-Id header', () => {
    const req = createMockReq({ 'x-request-id': 'custom-id-abc' });
    const res = createMockRes();

    requestId(req, res, next);

    expect(req.id).toBe('custom-id-abc');
    expect(res._headers['X-Request-Id']).toBe('custom-id-abc');
  });

  it('always calls next()', () => {
    const nextFn = vi.fn();
    requestId(createMockReq(), createMockRes(), nextFn);

    expect(nextFn).toHaveBeenCalledOnce();
  });
});
