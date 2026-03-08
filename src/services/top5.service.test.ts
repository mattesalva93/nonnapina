import { describe, expect, it } from 'vitest';
import { buildTop5PostContent, computeTop5Score, normalizeTitleForDedup } from './top5.service.js';

// ─── computeTop5Score ─────────────────────────────────────────────────────────

describe('computeTop5Score', () => {
  it('returns 0 when discount, rating, and reviews are all 0', () => {
    expect(computeTop5Score(0, 0, 0)).toBe(0);
  });

  it('gives higher score to higher discount with same confidence', () => {
    const high = computeTop5Score(70, 4.0, 100);
    const low = computeTop5Score(30, 4.0, 100);
    expect(high).toBeGreaterThan(low);
  });

  it('gives higher score to higher confidence with same discount', () => {
    const highConf = computeTop5Score(50, 4.5, 500);
    const lowConf = computeTop5Score(50, 4.5, 5);
    expect(highConf).toBeGreaterThan(lowConf);
  });

  it('discount dominates the score (W_DISCOUNT=0.6)', () => {
    // High discount, low rating vs low discount, high rating
    const highDiscount = computeTop5Score(80, 3.0, 100);
    const highRating = computeTop5Score(20, 5.0, 500);
    expect(highDiscount).toBeGreaterThan(highRating);
  });

  it('clamps discount to 0-100 range', () => {
    const over = computeTop5Score(150, 4.0, 100);
    const max = computeTop5Score(100, 4.0, 100);
    expect(over).toBe(max);

    const under = computeTop5Score(-10, 4.0, 100);
    const zero = computeTop5Score(0, 4.0, 100);
    expect(under).toBe(zero);
  });

  it('returns expected value for known inputs', () => {
    // discount=60%, rating=4.5, reviews=200
    // normalizedDiscount = 0.6
    // confidence ≈ 1 - e^(-200/30) ≈ 1.0
    // normalizedConfidence ≈ 4.5 * 1.0 / 5 = 0.9
    // score ≈ 0.6 * 0.6 + 0.4 * 0.9 = 0.36 + 0.36 = 0.72
    const score = computeTop5Score(60, 4.5, 200);
    expect(score).toBeCloseTo(0.72, 2);
  });

  it('review count affects confidence (k=30 characteristic)', () => {
    // At 30 reviews, confidence ≈ 63%
    const at30 = computeTop5Score(50, 4.0, 30);
    // confidence ≈ 1 - e^(-1) ≈ 0.632
    // normalizedConfidence ≈ 4.0 * 0.632 / 5 = 0.506
    // score ≈ 0.6 * 0.5 + 0.4 * 0.506 ≈ 0.30 + 0.20 = 0.50
    expect(at30).toBeCloseTo(0.502, 2);
  });
});

// ─── normalizeTitleForDedup ───────────────────────────────────────────────────

describe('normalizeTitleForDedup', () => {
  it('removes trailing parenthesized variant info', () => {
    const result = normalizeTitleForDedup('Faszin Asciugacapelli Professionale (Grigio)');
    expect(result).toBe('faszin asciugacapelli professionale');
  });

  it('removes only the last parenthesized group', () => {
    const result = normalizeTitleForDedup('Product (Feature) Model (Nero)');
    expect(result).toBe('product (feature) model');
  });

  it('returns lowercased trimmed title when no trailing parentheses', () => {
    const result = normalizeTitleForDedup('Some Product Title');
    expect(result).toBe('some product title');
  });

  it('handles empty string', () => {
    expect(normalizeTitleForDedup('')).toBe('');
  });
});

// ─── buildTop5PostContent ─────────────────────────────────────────────────────

describe('buildTop5PostContent', () => {
  const mockDeals = [
    {
      product: { title: 'Product One' },
      price: 29.99,
      currentPrice: 19.99,
      avgPrice: 39.99,
      discount: 50,
      affiliateWeb: 'https://amazon.it/dp/ASIN1?tag=test',
      reviewCount: 150,
      rating: 4.5,
    },
    {
      product: { title: 'Product Two' },
      price: 59.99,
      currentPrice: null,
      avgPrice: null,
      discount: null,
      affiliateWeb: 'https://amazon.it/dp/ASIN2?tag=test',
      reviewCount: 80,
      rating: 4.2,
    },
  ];

  it('includes header line', () => {
    const content = buildTop5PostContent(mockDeals);
    expect(content).toContain('TOP 5 OFFERTE DEL GIORNO');
  });

  it('lists deals without numbering', () => {
    const content = buildTop5PostContent(mockDeals);
    expect(content).toContain('💬 Product One');
    expect(content).toContain('💬 Product Two');
    expect(content).not.toMatch(/^\d+\./m);
  });

  it('shows discount price line when discount info is available', () => {
    const content = buildTop5PostContent(mockDeals);
    expect(content).toContain('19,99€ invece di 39,99€ (-50%)');
  });

  it('shows simple price line when no discount info', () => {
    const content = buildTop5PostContent(mockDeals);
    expect(content).toContain('59,99€');
    // Should not contain "invece di" for the second deal
    const lines = content.split('\n');
    const priceLine2 = lines.find(l => l.includes('59,99€'));
    expect(priceLine2).not.toContain('invece di');
  });

  it('uses currentPrice over price when available', () => {
    const content = buildTop5PostContent(mockDeals);
    // First deal: currentPrice=19.99, price=29.99 → should show 19,99
    expect(content).toContain('19,99€');
  });

  it('includes affiliate links', () => {
    const content = buildTop5PostContent(mockDeals);
    expect(content).toContain('https://amazon.it/dp/ASIN1?tag=test');
    expect(content).toContain('https://amazon.it/dp/ASIN2?tag=test');
  });

  it('includes review count and rating', () => {
    const content = buildTop5PostContent(mockDeals);
    expect(content).toContain('150 Recensioni: 4.5 / 5.0');
    expect(content).toContain('80 Recensioni: 4.2 / 5.0');
  });

  it('includes Amazon shipping notice exactly once at the bottom', () => {
    const content = buildTop5PostContent(mockDeals);
    const matches = content.match(/Venduto e spedito da Amazon/g);
    expect(matches).toHaveLength(1);
    expect(content.endsWith('🚚 Venduto e spedito da Amazon')).toBe(true);
  });

  it('handles empty deals array', () => {
    const content = buildTop5PostContent([]);
    expect(content).toContain('TOP 5 OFFERTE DEL GIORNO');
    expect(content).toContain('Venduto e spedito da Amazon');
  });
});
