import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('config parsing', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  async function importConfig() {
    const mod = await import('./index.js');
    return mod.config;
  }

  it('parses valid config in test environment', async () => {
    process.env.NODE_ENV = 'test';
    const config = await importConfig();
    expect(config.server.nodeEnv).toBe('test');
    expect(config.server.port).toBe(3000);
  });

  it('uses defaults for optional fields', async () => {
    process.env.NODE_ENV = 'test';
    const config = await importConfig();
    expect(config.keepa.maxProductsPerCategory).toBe(10);
    expect(config.keepa.scrapingDelayMs).toBe(2000);
    expect(config.telegram.botToken).toBe('');
    expect(config.whatsapp.channelId).toBe('');
  });

  it('reads env vars correctly', async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '4000';
    process.env.KEEPA_CATEGORIES = '1,5,7';
    process.env.SMTP_SECURE = 'true';
    const config = await importConfig();
    expect(config.server.port).toBe(4000);
    expect(config.keepa.categories).toEqual(['1', '5', '7']);
    expect(config.email.smtpSecure).toBe(true);
  });

  it('throws when AMAZON_ACCESS_KEY is missing in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
    delete process.env.AMAZON_ACCESS_KEY;
    process.env.AMAZON_SECRET_KEY = 'test-secret';
    process.env.AMAZON_PARTNER_TAG = 'test-tag';
    await expect(importConfig()).rejects.toThrow();
  });

  it('throws when DATABASE_URL is missing in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = '';
    process.env.AMAZON_ACCESS_KEY = 'test-key';
    process.env.AMAZON_SECRET_KEY = 'test-secret';
    process.env.AMAZON_PARTNER_TAG = 'test-tag';
    await expect(importConfig()).rejects.toThrow();
  });

  it('allows empty DATABASE_URL in test environment', async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = '';
    const config = await importConfig();
    expect(config.database.url).toBe('');
  });

  it('allows empty amazon keys in test environment', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.AMAZON_ACCESS_KEY;
    delete process.env.AMAZON_SECRET_KEY;
    delete process.env.AMAZON_PARTNER_TAG;
    const config = await importConfig();
    expect(config.amazon.accessKey).toBe('');
  });
});
