import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateConfig } from './index.js';

describe('validateConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  it('does not throw when all required env vars are present', () => {
    process.env.AMAZON_ACCESS_KEY = 'test-key';
    process.env.AMAZON_SECRET_KEY = 'test-secret';
    process.env.AMAZON_PARTNER_TAG = 'test-tag';

    expect(() => validateConfig()).not.toThrow();
  });

  it('throws when AMAZON_ACCESS_KEY is missing', () => {
    delete process.env.AMAZON_ACCESS_KEY;
    process.env.AMAZON_SECRET_KEY = 'test-secret';
    process.env.AMAZON_PARTNER_TAG = 'test-tag';

    expect(() => validateConfig()).toThrow('AMAZON_ACCESS_KEY');
  });

  it('throws when AMAZON_SECRET_KEY is missing', () => {
    process.env.AMAZON_ACCESS_KEY = 'test-key';
    delete process.env.AMAZON_SECRET_KEY;
    process.env.AMAZON_PARTNER_TAG = 'test-tag';

    expect(() => validateConfig()).toThrow('AMAZON_SECRET_KEY');
  });

  it('throws when AMAZON_PARTNER_TAG is missing', () => {
    process.env.AMAZON_ACCESS_KEY = 'test-key';
    process.env.AMAZON_SECRET_KEY = 'test-secret';
    delete process.env.AMAZON_PARTNER_TAG;

    expect(() => validateConfig()).toThrow('AMAZON_PARTNER_TAG');
  });

  it('throws listing all missing required variables', () => {
    delete process.env.AMAZON_ACCESS_KEY;
    delete process.env.AMAZON_SECRET_KEY;
    delete process.env.AMAZON_PARTNER_TAG;

    expect(() => validateConfig()).toThrow('Missing required environment variables');
  });
});
