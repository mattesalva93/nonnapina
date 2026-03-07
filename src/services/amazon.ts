import axios from 'axios';
import { config } from '../config/index.js';
import type { AffiliateLinks, AmazonProduct, ApiItem, LinkOptions } from '../types/index.js';

const MARKETPLACE_URLS: Record<string, string> = {
  IT: 'www.amazon.it',
  US: 'www.amazon.com',
  UK: 'www.amazon.co.uk',
  DE: 'www.amazon.de',
  FR: 'www.amazon.fr',
  ES: 'www.amazon.es',
};

const MARKETPLACE_LANGUAGES: Record<string, string> = {
  IT: 'it_IT',
  US: 'en_US',
  UK: 'en_GB',
  DE: 'de_DE',
  FR: 'fr_FR',
  ES: 'es_ES',
};

class AmazonService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly partnerTag: string;
  private readonly marketplace: string;
  private readonly tokenEndpoint: string;
  private readonly apiBaseUrl: string;

  private accessToken: string | undefined;
  private tokenExpiry: number | undefined;

  constructor() {
    this.clientId = config.amazon.accessKey;
    this.clientSecret = config.amazon.secretKey;
    this.partnerTag = config.amazon.partnerTag;
    this.marketplace = config.amazon.marketplace.toUpperCase();
    this.tokenEndpoint = 'https://creatorsapi.auth.eu-south-2.amazoncognito.com/oauth2/token';
    this.apiBaseUrl = 'https://creatorsapi.amazon';
  }

  async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const response = await axios.post<{ access_token?: string; expires_in: number }>(
      this.tokenEndpoint,
      'grant_type=client_credentials&scope=creatorsapi/default',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${credentials}`,
        },
        timeout: 10000,
      }
    );

    if (!response.data?.access_token) {
      throw new Error('No access token in response');
    }

    this.accessToken = response.data.access_token;
    this.tokenExpiry = Date.now() + response.data.expires_in * 1000 - 300000;

    return this.accessToken;
  }

  async getProductDetails(asins: string[], options: LinkOptions = {}): Promise<AmazonProduct[]> {
    console.log(`\n🔍 Fetching details for ${asins.length} products from Amazon Creators API...`);

    const BATCH_SIZE = 10;
    const batches = this.chunkArray(asins, BATCH_SIZE);
    const allProducts: AmazonProduct[] = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`📦 Processing batch ${i + 1}/${batches.length} (${batch.length} items)`);

      try {
        const products = await this.fetchProductBatch(batch, options);
        allProducts.push(...products);
        console.log(`✅ Fetched ${products.length} items`);

        if (i < batches.length - 1) {
          await this.sleep(1000);
        }
      } catch (error) {
        console.error(`❌ Error fetching batch ${i + 1}:`, (error as Error).message);
      }
    }

    console.log(`\n🎉 Successfully fetched ${allProducts.length} products from Amazon`);
    return allProducts;
  }

  private async fetchProductBatch(
    asins: string[],
    options: LinkOptions = {}
  ): Promise<AmazonProduct[]> {
    const accessToken = await this.getAccessToken();

    const payload = {
      itemIds: asins,
      itemIdType: 'ASIN',
      marketplace: this.getMarketplaceUrl(),
      partnerTag: this.partnerTag,
      resources: [
        'images.primary.small',
        'images.primary.large',
        'itemInfo.title',
        'itemInfo.features',
        'parentASIN',
        'customerReviews.starRating',
        'customerReviews.count',
        'offersV2.listings.price',
        'offersV2.listings.availability',
      ],
    };

    const response = await axios.post<{ itemsResult?: { items?: ApiItem[] } }>(
      `${this.apiBaseUrl}/catalog/v1/getItems`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}, Version 2.2`,
          'x-marketplace': this.getMarketplaceUrl(),
        },
        timeout: 10000,
      }
    );

    if (response.data?.itemsResult?.items) {
      return response.data.itemsResult.items.map(product => this.formatProduct(product, options));
    }

    return [];
  }

  getMarketplaceUrl(): string {
    return MARKETPLACE_URLS[this.marketplace] ?? MARKETPLACE_URLS.IT;
  }

  formatProduct(product: ApiItem, options: LinkOptions = {}): AmazonProduct {
    let price: number | undefined;
    let currency: string | undefined;
    let availability: { message?: string; type?: string } | undefined;

    if (product.offersV2?.listings?.[0]) {
      const listing = product.offersV2.listings[0];
      if (listing.price) {
        price = listing.price.money?.amount ?? listing.price.amount;
        currency = listing.price.money?.currency ?? listing.price.currency;
      }
      if (listing.availability) {
        availability = listing.availability;
      }
    }

    let rating: number | undefined;
    const starRating = product.customerReviews?.starRating;
    if (starRating != null) {
      if (typeof starRating === 'number') {
        rating = starRating;
      } else if (typeof starRating === 'object') {
        const sr = starRating as { value?: number; displayValue?: string };
        rating = sr.value ?? (sr.displayValue ? parseFloat(sr.displayValue) : undefined);
      } else if (typeof starRating === 'string') {
        rating = parseFloat(starRating) || undefined;
      }
    }

    let ratingCount: number | undefined;
    const reviewCount = product.customerReviews?.count ?? product.customerReviews?.reviewsCount;
    if (reviewCount != null) {
      if (typeof reviewCount === 'number') {
        ratingCount = reviewCount;
      } else if (typeof reviewCount === 'object') {
        const rc = reviewCount as { value?: number; displayValue?: number };
        ratingCount = rc.value ?? rc.displayValue ?? undefined;
      } else if (typeof reviewCount === 'string') {
        ratingCount = parseInt(reviewCount, 10) || undefined;
      }
    }

    const affiliateLinks = this.buildAffiliateLink(product.asin, options);

    return {
      asin: product.asin,
      parentASIN: product.parentASIN,
      title: product.itemInfo?.title?.displayValue ?? 'N/A',
      price,
      originalPrice: undefined,
      discountAmount: undefined,
      discountPercentage: undefined,
      currency: currency ?? 'EUR',
      availability,
      rating,
      ratingCount,
      features: product.itemInfo?.features?.displayValues ?? [],
      image: {
        small: product.images?.primary?.small?.url,
        large: product.images?.primary?.large?.url,
      },
      affiliateLinks,
      rawData: {
        itemInfo: product.itemInfo ?? undefined,
        images: product.images ?? undefined,
        offersV2: product.offersV2 ?? undefined,
        customerReviews: product.customerReviews ?? undefined,
        detailPageURL: product.detailPageURL,
      },
      fetchedAt: new Date().toISOString(),
      marketplace: config.amazon.marketplace,
    };
  }

  buildAffiliateLink(asin: string, options: LinkOptions = {}): AffiliateLinks {
    const marketplace = config.amazon.marketplace.toLowerCase();
    const baseUrl = `https://www.amazon.${marketplace}`;
    const partnerTag = config.amazon.partnerTag;
    const language = MARKETPLACE_LANGUAGES[this.marketplace] ?? MARKETPLACE_LANGUAGES.IT;

    return {
      web: this.buildWebLink(baseUrl, asin, partnerTag, language, options.ref),
      storefront: options.storefront
        ? this.buildStorefrontLink(baseUrl, asin, options.storefront, partnerTag)
        : undefined,
    };
  }

  private buildWebLink(
    baseUrl: string,
    asin: string,
    partnerTag: string,
    language: string,
    ref?: string
  ): string {
    let url = `${baseUrl}/dp/${asin}/?tag=${partnerTag}&linkCode=ll1&language=${language}`;
    if (ref) {
      url += `&ref=${encodeURIComponent(ref)}`;
    }
    return url;
  }

  private buildStorefrontLink(
    baseUrl: string,
    asin: string,
    storefrontId: string,
    partnerTag: string
  ): string {
    return `${baseUrl}/services/storefront?storefront_id=${storefrontId}&asins=${asin}&tag=${partnerTag}`;
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const amazonService = new AmazonService();

if (import.meta.url === `file://${process.argv[1]}`) {
  const testAsins = ['B0DHRQ2XGJ', 'B08N5WRWNW'];
  amazonService
    .getProductDetails(testAsins)
    .then(products => {
      console.log('\n✅ Test completed: fetched', products.length, 'products');
    })
    .catch(console.error);
}
