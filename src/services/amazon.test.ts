import { describe, expect, it } from 'vitest';
import type { ApiItem } from '../types/index.js';
import { amazonService } from './amazon.js';

function makeApiItem(overrides: Partial<ApiItem> = {}): ApiItem {
  return {
    asin: 'B0TEST1234',
    parentASIN: 'B0PARENT',
    detailPageURL: 'https://www.amazon.it/dp/B0TEST1234',
    itemInfo: {
      title: { displayValue: 'Test Product Title' },
      features: { displayValues: ['Feature 1', 'Feature 2'] },
    },
    images: {
      primary: {
        small: { url: 'https://images.amazon.com/small.jpg' },
        large: { url: 'https://images.amazon.com/large.jpg' },
      },
    },
    offersV2: {
      listings: [
        {
          price: { money: { amount: 29.99, currency: 'EUR' } },
          availability: { message: 'In stock', type: 'NOW' },
        },
      ],
    },
    customerReviews: {
      starRating: 4.5,
      count: 1234,
    },
    ...overrides,
  };
}

describe('AmazonService.formatProduct', () => {
  it('extracts all fields from a complete API item', () => {
    const result = amazonService.formatProduct(makeApiItem());

    expect(result.asin).toBe('B0TEST1234');
    expect(result.parentASIN).toBe('B0PARENT');
    expect(result.title).toBe('Test Product Title');
    expect(result.price).toBe(29.99);
    expect(result.currency).toBe('EUR');
    expect(result.rating).toBe(4.5);
    expect(result.ratingCount).toBe(1234);
    expect(result.features).toEqual(['Feature 1', 'Feature 2']);
    expect(result.image.small).toBe('https://images.amazon.com/small.jpg');
    expect(result.image.large).toBe('https://images.amazon.com/large.jpg');
    expect(result.availability).toEqual({ message: 'In stock', type: 'NOW' });
  });

  it('handles missing price data', () => {
    const result = amazonService.formatProduct(makeApiItem({ offersV2: undefined }));

    expect(result.price).toBeUndefined();
    expect(result.currency).toBe('EUR');
    expect(result.availability).toBeUndefined();
  });

  it('handles price without money wrapper (fallback fields)', () => {
    const item = makeApiItem({
      offersV2: {
        listings: [{ price: { amount: 19.99, currency: 'USD' } }],
      },
    });
    const result = amazonService.formatProduct(item);

    expect(result.price).toBe(19.99);
    expect(result.currency).toBe('USD');
  });

  it('handles starRating as object with value', () => {
    const item = makeApiItem({
      customerReviews: { starRating: { value: 3.8 } as unknown as number },
    });
    const result = amazonService.formatProduct(item);

    expect(result.rating).toBe(3.8);
  });

  it('handles starRating as object with displayValue', () => {
    const item = makeApiItem({
      customerReviews: { starRating: { displayValue: '4.2' } as unknown as number },
    });
    const result = amazonService.formatProduct(item);

    expect(result.rating).toBe(4.2);
  });

  it('handles starRating as string', () => {
    const item = makeApiItem({
      customerReviews: { starRating: '4.1' as unknown as number },
    });
    const result = amazonService.formatProduct(item);

    expect(result.rating).toBe(4.1);
  });

  it('handles count as object with value', () => {
    const item = makeApiItem({
      customerReviews: { starRating: 4, count: { value: 500 } as unknown as number },
    });
    const result = amazonService.formatProduct(item);

    expect(result.ratingCount).toBe(500);
  });

  it('handles count as string', () => {
    const item = makeApiItem({
      customerReviews: { starRating: 4, count: '999' as unknown as number },
    });
    const result = amazonService.formatProduct(item);

    expect(result.ratingCount).toBe(999);
  });

  it('handles missing reviews entirely', () => {
    const result = amazonService.formatProduct(makeApiItem({ customerReviews: undefined }));

    expect(result.rating).toBeUndefined();
    expect(result.ratingCount).toBeUndefined();
  });

  it('handles missing title', () => {
    const item = makeApiItem({ itemInfo: undefined });
    const result = amazonService.formatProduct(item);

    expect(result.title).toBe('N/A');
    expect(result.features).toEqual([]);
  });

  it('includes fetchedAt and marketplace', () => {
    const result = amazonService.formatProduct(makeApiItem());

    expect(result.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.marketplace).toBeDefined();
  });
});

describe('AmazonService.buildAffiliateLink', () => {
  it('returns web link with partner tag and language', () => {
    const links = amazonService.buildAffiliateLink('B0TEST1234');

    expect(links.web).toContain('amazon.');
    expect(links.web).toContain('/dp/B0TEST1234');
    expect(links.web).toContain('tag=');
    expect(links.web).toContain('language=');
  });

  it('does not include storefront link by default', () => {
    const links = amazonService.buildAffiliateLink('B0TEST1234');

    expect(links.storefront).toBeUndefined();
  });

  it('includes storefront link when storefront option provided', () => {
    const links = amazonService.buildAffiliateLink('B0TEST1234', { storefront: 'SF123' });

    expect(links.storefront).toContain('storefront_id=SF123');
    expect(links.storefront).toContain('asins=B0TEST1234');
    expect(links.storefront).toContain('tag=');
  });

  it('includes ref parameter when provided', () => {
    const links = amazonService.buildAffiliateLink('B0TEST1234', { ref: 'my_ref' });

    expect(links.web).toContain('ref=my_ref');
  });
});

describe('AmazonService.getMarketplaceUrl', () => {
  it('returns a valid amazon domain', () => {
    const url = amazonService.getMarketplaceUrl();

    expect(url).toMatch(/^www\.amazon\./);
  });
});
