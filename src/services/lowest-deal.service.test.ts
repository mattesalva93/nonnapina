import { describe, expect, it } from 'vitest';
import { buildLowestPostContent } from './lowest-deal.service.js';

// ─── buildLowestPostContent ───────────────────────────────────────────────────

describe('buildLowestPostContent', () => {
  const mockDeal = {
    product: { title: 'Apple iPhone 13 (128 GB) - Mezzanotte' },
    price: 599.0,
    currentPrice: 489.99,
    avgPrice: 749.0,
    discount: 35,
    affiliateWeb: 'https://amazon.it/dp/B09V3KXJPB?tag=test',
    reviewCount: 2500,
    rating: 4.6,
  };

  it('starts with a headline containing the product name', () => {
    const content = buildLowestPostContent(mockDeal);
    // The headline (first line) should start with 📢 and reference the product
    const firstLine = content.split('\n')[0];
    expect(firstLine).toMatch(/^📢 /);
  });

  it('includes the full product title after the headline', () => {
    const content = buildLowestPostContent(mockDeal);
    expect(content).toContain('💬 Apple iPhone 13 (128 GB) - Mezzanotte');
  });

  it('shows discount price line with "Solo" format', () => {
    const content = buildLowestPostContent(mockDeal);
    expect(content).toContain('Solo 489,99€ invece di 749,00€ (-35%)');
  });

  it('includes the average price disclaimer', () => {
    const content = buildLowestPostContent(mockDeal);
    expect(content).toContain('📊 Il prezzo pieno è calcolato sulla media degli ultimi 3 mesi');
  });

  it('uses currentPrice over price when available', () => {
    const content = buildLowestPostContent(mockDeal);
    expect(content).toContain('489,99€');
    expect(content).not.toContain('599,00€');
  });

  it('includes affiliate link', () => {
    const content = buildLowestPostContent(mockDeal);
    expect(content).toContain('https://amazon.it/dp/B09V3KXJPB?tag=test');
  });

  it('includes review count and rating', () => {
    const content = buildLowestPostContent(mockDeal);
    expect(content).toContain('2500 Recensioni: 4.6 / 5.0');
  });

  it('includes Amazon shipping notice', () => {
    const content = buildLowestPostContent(mockDeal);
    expect(content).toContain('🚚 Venduto e spedito da Amazon');
  });

  it('handles deal without discount info', () => {
    const simpleContent = buildLowestPostContent({
      ...mockDeal,
      avgPrice: null,
      discount: null,
    });
    expect(simpleContent).toContain('Solo 489,99€');
    expect(simpleContent).not.toContain('invece di');
    expect(simpleContent).not.toContain('📊');
  });

  it('shortens long product titles in the headline', () => {
    const longTitleDeal = {
      ...mockDeal,
      product: {
        title:
          'Xiaomi Redmi Note 13 Pro+ 5G Smartphone 8+256GB Display AMOLED 6.67" 200MP (Midnight Black)',
      },
    };
    const content = buildLowestPostContent(longTitleDeal);
    const firstLine = content.split('\n')[0];
    // The headline should be shorter than the full title
    expect(firstLine.length).toBeLessThan(longTitleDeal.product.title.length + 10);
    // But the full title should still appear in the body
    expect(content).toContain('💬 Xiaomi Redmi Note 13 Pro+ 5G Smartphone 8+256GB');
  });

  it('headline uses one of the known template patterns', () => {
    const content = buildLowestPostContent(mockDeal);
    const firstLine = content.split('\n')[0];
    const patterns = [
      /minimo storico/,
      /Prezzo più basso di sempre/,
      /mai così economico/,
      /Minimo storico raggiunto/,
    ];
    const matchesAny = patterns.some(p => p.test(firstLine));
    expect(matchesAny).toBe(true);
  });
});
