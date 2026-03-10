import axios from 'axios';
import { config } from '../config/index.js';
import type { AffiliateLinks, AmazonProduct, ApiItem, LinkOptions } from '../types/index.js';
import { localISOString } from '../utils/date.js';
import { createComponentLogger } from '../utils/logger.js';
import { sendErrorAlert } from './email.service.js';

const logger = createComponentLogger('AmazonService');

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

// ─── Module-level state (replaces class instance fields) ──────────────────────

const clientId = config.amazon.accessKey;
const clientSecret = config.amazon.secretKey;
const partnerTag = config.amazon.partnerTag;
const marketplace = config.amazon.marketplace.toUpperCase();
const tokenEndpoint = 'https://creatorsapi.auth.eu-south-2.amazoncognito.com/oauth2/token';
const apiBaseUrl = 'https://creatorsapi.amazon';

let accessToken: string | undefined;
let tokenExpiry: number | undefined;

// ─── Helper functions ─────────────────────────────────────────────────────────

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildWebLink(
  baseUrl: string,
  asin: string,
  tag: string,
  language: string,
  ref?: string
): string {
  let url = `${baseUrl}/dp/${asin}/?tag=${tag}&linkCode=ll1&language=${language}`;
  if (ref) {
    url += `&ref=${encodeURIComponent(ref)}`;
  }
  return url;
}

function buildStorefrontLink(
  baseUrl: string,
  asin: string,
  storefrontId: string,
  tag: string
): string {
  return `${baseUrl}/services/storefront?storefront_id=${storefrontId}&asins=${asin}&tag=${tag}`;
}

// ─── Public functions ─────────────────────────────────────────────────────────

async function getAccessToken(): Promise<string> {
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    logger.debug('Using cached Amazon access token');
    return accessToken;
  }

  logger.info('Requesting new Amazon OAuth access token');
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await axios.post<{ access_token?: string; expires_in: number }>(
    tokenEndpoint,
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
    const err = new Error('No access token in response');
    logger.error('Amazon OAuth response missing access_token');
    void sendErrorAlert({
      errorMessage: err.message,
      component: 'AmazonService',
      severity: 'critical',
    });
    throw err;
  }

  accessToken = response.data.access_token;
  tokenExpiry = Date.now() + response.data.expires_in * 1000 - 300000;
  logger.info('Amazon OAuth access token acquired');

  return accessToken;
}

async function fetchProductBatch(
  asins: string[],
  options: LinkOptions = {}
): Promise<AmazonProduct[]> {
  const token = await getAccessToken();

  const payload = {
    itemIds: asins,
    itemIdType: 'ASIN',
    marketplace: getMarketplaceUrl(),
    partnerTag,
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
    `${apiBaseUrl}/catalog/v1/getItems`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}, Version 2.2`,
        'x-marketplace': getMarketplaceUrl(),
      },
      timeout: 10000,
    }
  );

  if (response.data?.itemsResult?.items) {
    return response.data.itemsResult.items.map(product => formatProduct(product, options));
  }

  return [];
}

function getMarketplaceUrl(): string {
  return MARKETPLACE_URLS[marketplace] ?? MARKETPLACE_URLS.IT;
}

function formatProduct(product: ApiItem, options: LinkOptions = {}): AmazonProduct {
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

  const affiliateLinks = buildAffiliateLink(product.asin, options);

  return {
    asin: product.asin,
    parentASIN: product.parentASIN,
    title: product.itemInfo?.title?.displayValue ?? 'N/A',
    price,
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
    fetchedAt: localISOString(),
    marketplace: config.amazon.marketplace,
  };
}

function buildAffiliateLink(asin: string, options: LinkOptions = {}): AffiliateLinks {
  const mp = config.amazon.marketplace.toLowerCase();
  const baseUrl = `https://www.amazon.${mp}`;
  const language = MARKETPLACE_LANGUAGES[marketplace] ?? MARKETPLACE_LANGUAGES.IT;

  return {
    web: buildWebLink(baseUrl, asin, partnerTag, language, options.ref),
    storefront: options.storefront
      ? buildStorefrontLink(baseUrl, asin, options.storefront, partnerTag)
      : undefined,
  };
}

async function getProductDetails(
  asins: string[],
  options: LinkOptions = {}
): Promise<AmazonProduct[]> {
  logger.info({ asinCount: asins.length }, 'Fetching product details from Amazon Creators API');

  const BATCH_SIZE = 10;
  const batches = chunkArray(asins, BATCH_SIZE);
  const allProducts: AmazonProduct[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    logger.info(
      { batch: i + 1, total: batches.length, batchSize: batch.length },
      'Processing Amazon API batch'
    );

    try {
      const products = await fetchProductBatch(batch, options);
      allProducts.push(...products);
      logger.info({ batch: i + 1, fetched: products.length }, 'Amazon API batch completed');

      if (i < batches.length - 1) {
        await sleep(1000);
      }
    } catch (error) {
      const message = (error as Error).message;
      logger.error({ batch: i + 1, error: message }, 'Amazon API batch failed');
      void sendErrorAlert({
        errorMessage: `Amazon API batch ${i + 1}/${batches.length} failed: ${message}`,
        errorStack: (error as Error).stack,
        component: 'AmazonService',
        severity: 'error',
        additionalData: { batch: i + 1, totalBatches: batches.length, asins: batch },
      });
    }
  }

  logger.info({ totalFetched: allProducts.length }, 'Amazon product fetch complete');
  return allProducts;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const amazonService = {
  getAccessToken,
  getProductDetails,
  getMarketplaceUrl,
  formatProduct,
  buildAffiliateLink,
};
