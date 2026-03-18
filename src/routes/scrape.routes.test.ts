import { describe, expect, it } from 'vitest';
import { isRetryableScrapeError } from './scrape.routes.js';

describe('isRetryableScrapeError', () => {
  it('returns true for protocolTimeout errors', () => {
    const error = new Error(
      "Runtime.callFunctionOn timed out. Increase the 'protocolTimeout' setting"
    );
    expect(isRetryableScrapeError(error)).toBe(true);
  });

  it('returns true for generic timeout errors', () => {
    expect(isRetryableScrapeError(new Error('Navigation timeout of 30000ms exceeded'))).toBe(true);
    expect(isRetryableScrapeError(new Error('Waiting for selector timed out'))).toBe(true);
  });

  it('returns true for browser crash errors', () => {
    expect(isRetryableScrapeError(new Error('Browser launch failed after 3 attempts'))).toBe(true);
    expect(isRetryableScrapeError(new Error('Browser launched but page is not responsive'))).toBe(
      true
    );
  });

  it('returns true for target/session closed errors', () => {
    expect(isRetryableScrapeError(new Error('Target closed'))).toBe(true);
    expect(
      isRetryableScrapeError(new Error('Session closed. Most likely the page has been closed'))
    ).toBe(true);
  });

  it('returns true for WebSocket errors', () => {
    expect(isRetryableScrapeError(new Error('Failed to fetch browser webSocket URL'))).toBe(true);
  });

  it('returns true for Runtime.callFunctionOn errors', () => {
    expect(isRetryableScrapeError(new Error('Runtime.callFunctionOn timed out'))).toBe(true);
  });

  it('returns false for non-Error values', () => {
    expect(isRetryableScrapeError('some string')).toBe(false);
    expect(isRetryableScrapeError(42)).toBe(false);
    expect(isRetryableScrapeError(undefined)).toBe(false);
  });

  it('returns false for non-retryable errors', () => {
    expect(isRetryableScrapeError(new Error('AMAZON_ACCESS_KEY is required'))).toBe(false);
    expect(isRetryableScrapeError(new Error('Invalid configuration'))).toBe(false);
    expect(isRetryableScrapeError(new Error('Database connection failed'))).toBe(false);
  });
});
