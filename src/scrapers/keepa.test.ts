import { describe, expect, it } from 'vitest';
import type { KeepaProduct } from '../types/index.js';
import { mergeLowestFlags } from './keepa.js';

function makeProduct(asin: string, overrides: Partial<KeepaProduct> = {}): KeepaProduct {
  return {
    asin,
    category: 'Bellezza',
    discount: 30,
    avgPrice: 20,
    currentPrice: 14,
    rating: 4.2,
    reviewCount: 100,
    isLowest: false,
    ...overrides,
  };
}

describe('mergeLowestFlags', () => {
  it('flags products whose ASIN appears in the lowestAsins set', () => {
    const products = [makeProduct('AAA'), makeProduct('BBB'), makeProduct('CCC')];
    const lowestAsins = new Set(['BBB']);

    const result = mergeLowestFlags(products, lowestAsins);

    expect(result).toHaveLength(3);
    expect(result[0].isLowest).toBe(false);
    expect(result[1].isLowest).toBe(true);
    expect(result[2].isLowest).toBe(false);
  });

  it('flags nothing when lowestAsins is empty', () => {
    const products = [makeProduct('AAA'), makeProduct('BBB')];
    const lowestAsins = new Set<string>();

    const result = mergeLowestFlags(products, lowestAsins);

    expect(result.every(p => p.isLowest === false)).toBe(true);
  });

  it('flags all products when all ASINs are in lowestAsins', () => {
    const products = [makeProduct('AAA'), makeProduct('BBB')];
    const lowestAsins = new Set(['AAA', 'BBB']);

    const result = mergeLowestFlags(products, lowestAsins);

    expect(result.every(p => p.isLowest === true)).toBe(true);
  });

  it('handles lowestAsins containing ASINs not in pass 1 (ignored safely)', () => {
    const products = [makeProduct('AAA')];
    const lowestAsins = new Set(['AAA', 'ZZZ_NOT_IN_PASS1']);

    const result = mergeLowestFlags(products, lowestAsins);

    expect(result).toHaveLength(1);
    expect(result[0].isLowest).toBe(true);
  });

  it('returns empty array when products is empty', () => {
    const result = mergeLowestFlags([], new Set(['AAA']));
    expect(result).toEqual([]);
  });

  it('does not mutate original products', () => {
    const products = [makeProduct('AAA'), makeProduct('BBB')];
    const lowestAsins = new Set(['AAA']);

    mergeLowestFlags(products, lowestAsins);

    expect(products[0].isLowest).toBe(false);
    expect(products[1].isLowest).toBe(false);
  });

  it('preserves all other product fields', () => {
    const original = makeProduct('AAA', {
      category: 'Elettronica',
      discount: 45,
      avgPrice: 100,
      currentPrice: 55,
      rating: 4.8,
      reviewCount: 500,
    });
    const lowestAsins = new Set(['AAA']);

    const [result] = mergeLowestFlags([original], lowestAsins);

    expect(result.asin).toBe('AAA');
    expect(result.category).toBe('Elettronica');
    expect(result.discount).toBe(45);
    expect(result.avgPrice).toBe(100);
    expect(result.currentPrice).toBe(55);
    expect(result.rating).toBe(4.8);
    expect(result.reviewCount).toBe(500);
    expect(result.isLowest).toBe(true);
  });

  it('realistic scenario: 10 products, 3 are lowest', () => {
    const asins = ['B001', 'B002', 'B003', 'B004', 'B005', 'B006', 'B007', 'B008', 'B009', 'B010'];
    const products = asins.map(a => makeProduct(a));
    const lowestAsins = new Set(['B002', 'B005', 'B009']);

    const result = mergeLowestFlags(products, lowestAsins);

    const lowestResults = result.filter(p => p.isLowest);
    const normalResults = result.filter(p => !p.isLowest);

    expect(lowestResults).toHaveLength(3);
    expect(normalResults).toHaveLength(7);
    expect(lowestResults.map(p => p.asin).sort()).toEqual(['B002', 'B005', 'B009']);
  });
});
