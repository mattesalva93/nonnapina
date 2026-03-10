import { describe, expect, it } from 'vitest';
import { buildPostContent } from './publish.service.js';

function makeDeal(overrides: Partial<Parameters<typeof buildPostContent>[0]> = {}) {
  return {
    product: { title: 'Cuffie Bluetooth Sony WH-1000XM5' },
    price: 299.99,
    currentPrice: 249.99,
    avgPrice: 349.99,
    discount: 29,
    affiliateWeb: 'https://www.amazon.it/dp/B0BX1234?tag=test-21',
    reviewCount: 12345,
    rating: 4.7,
    ...overrides,
  };
}

describe('buildPostContent', () => {
  it('builds a complete post with all deal data', () => {
    const content = buildPostContent(makeDeal());

    expect(content).toContain('Cuffie Bluetooth Sony WH-1000XM5');
    expect(content).toContain('249,99€');
    expect(content).toContain('349,99€');
    expect(content).toContain('-29%');
    expect(content).toContain('https://www.amazon.it/dp/B0BX1234?tag=test-21');
    expect(content).toContain('12345 Recensioni');
    expect(content).toContain('4.7 / 5.0');
    expect(content).toContain('media degli ultimi 3 mesi');
  });

  it('falls back to price when currentPrice is null', () => {
    const content = buildPostContent(makeDeal({ currentPrice: undefined }));

    expect(content).toContain('299,99€');
  });

  it('shows simple price line when avgPrice is null', () => {
    const content = buildPostContent(makeDeal({ avgPrice: undefined }));

    expect(content).toContain('Solo 249,99€');
    expect(content).not.toContain('invece di');
    expect(content).not.toContain('media degli ultimi 3 mesi');
  });

  it('shows simple price line when discount is null', () => {
    const content = buildPostContent(makeDeal({ discount: undefined }));

    expect(content).not.toContain('-%');
    expect(content).not.toContain('invece di');
  });

  it('shows dash when no price is available', () => {
    const content = buildPostContent(makeDeal({ currentPrice: undefined, price: undefined }));

    expect(content).toContain('Solo –€');
  });

  it('handles zero reviewCount gracefully', () => {
    const content = buildPostContent(makeDeal({ reviewCount: 0 }));

    expect(content).toContain('0 Recensioni');
  });

  it('handles null rating', () => {
    const content = buildPostContent(makeDeal({ rating: undefined }));

    expect(content).toContain('– / 5.0');
  });

  it('handles empty affiliate link', () => {
    const content = buildPostContent(makeDeal({ affiliateWeb: undefined }));

    expect(content).toContain('🔗 ');
  });

  it('produces lines separated by newlines', () => {
    const content = buildPostContent(makeDeal());
    const lines = content.split('\n');

    // Title, empty, price line, avg price note, empty, link, empty, reviews, shipping
    expect(lines.length).toBeGreaterThanOrEqual(8);
    expect(lines[0]).toMatch(/^💬/);
    expect(lines.at(-1)).toContain('Amazon');
  });
});
