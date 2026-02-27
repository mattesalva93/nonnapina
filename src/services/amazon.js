import axios from 'axios';
import { config } from '../config/index.js';

/**
 * Amazon Creators API client for fetching product information
 * Uses OAuth 2.0 token-based authentication
 */
class AmazonService {
  constructor() {
    this.clientId = config.amazon.accessKey;
    this.clientSecret = config.amazon.secretKey;
    this.partnerTag = config.amazon.partnerTag;
    this.marketplace = config.amazon.marketplace.toUpperCase();

    // Creators API configuration - OAuth 2.0
    this.tokenEndpoint = 'https://creatorsapi.auth.eu-south-2.amazoncognito.com/oauth2/token'; // EU endpoint (Italy)
    this.apiBaseUrl = 'https://creatorsapi.amazon';

    // Token caching
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Get OAuth 2.0 access token from Cognito
   */
  async getAccessToken() {
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

      const response = await axios.post(
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
      // Set expiry to 55 minutes (token lasts 60, refresh 5 min before)
      this.tokenExpiry = Date.now() + response.data.expires_in * 1000 - 300000;

      return this.accessToken;
    } catch (error) {
      console.error('❌ Failed to get access token:', error.message);
      if (error.response?.data) {
        console.error('   Response:', JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }

  /**
   * Fetch product details for multiple ASINs via Creators API
   * @param {string[]} asins - Array of ASINs
   * @param {Object} options - Link generation options
   * @param {string} options.storefront - Your storefront ID
   * @returns {Promise<Array>}
   */
  async getProductDetails(asins, options = {}) {
    console.log(`\n🔍 Fetching details for ${asins.length} products from Amazon Creators API...`);

    const BATCH_SIZE = 10; // Creators API batch size
    const batches = this.chunkArray(asins, BATCH_SIZE);
    const allProducts = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`📦 Processing batch ${i + 1}/${batches.length} (${batch.length} items)`);

      try {
        const products = await this.fetchProductBatch(batch, options);
        allProducts.push(...products);
        console.log(`✅ Fetched ${products.length} items`);

        // Rate limiting: 1 request per second
        if (i < batches.length - 1) {
          await this.sleep(1000);
        }
      } catch (error) {
        console.error(`❌ Error fetching batch ${i + 1}:`, error.message);
        // Continue with next batch even if one fails
      }
    }

    console.log(`\n🎉 Successfully fetched ${allProducts.length} products from Amazon`);
    return allProducts;
  }

  /**
   * Fetch a batch of products from Creators API (catalog/v1/getItems)
   */
  async fetchProductBatch(asins, options = {}) {
    try {
      // Get fresh access token
      const accessToken = await this.getAccessToken();

      // Build request to Creators API
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

      const response = await axios.post(`${this.apiBaseUrl}/catalog/v1/getItems`, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}, Version 2.2`,
          'x-marketplace': this.getMarketplaceUrl(),
        },
        timeout: 10000,
      });

      // Map response to expected format with options
      if (response.data?.itemsResult?.items) {
        return response.data.itemsResult.items.map(product => this.formatProduct(product, options));
      }

      return [];
    } catch (error) {
      if (error.response?.status === 400) {
        console.error('❌ Bad Request - check payload format');
        console.error('   Response:', JSON.stringify(error.response.data, null, 2));
      } else if (error.response?.status === 401 || error.response?.status === 403) {
        console.error('❌ Authentication error - check Creators API credentials');
        console.error('   Response:', JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }

  /**
   * Get marketplace URL from marketplace code
   */
  getMarketplaceUrl() {
    const marketplaceUrls = {
      IT: 'www.amazon.it',
      US: 'www.amazon.com',
      UK: 'www.amazon.co.uk',
      DE: 'www.amazon.de',
      FR: 'www.amazon.fr',
      ES: 'www.amazon.es',
    };
    return marketplaceUrls[this.marketplace] || marketplaceUrls.IT;
  }

  /**
   * Format product data from Creators API response (COMPLETE with all API data)
   */
  formatProduct(product, options = {}) {
    // Extract pricing from offersV2 if available
    let price = null;
    let currency = null;
    let availability = null;

    if (product.offersV2?.listings?.[0]) {
      // Handle price structure: price.money.amount or price.amount
      if (product.offersV2.listings[0].price) {
        const priceStructure = product.offersV2.listings[0].price;
        price = priceStructure.money?.amount || priceStructure.amount;
        currency = priceStructure.money?.currency || priceStructure.currency;
      }

      if (product.offersV2.listings[0].availability) {
        availability = product.offersV2.listings[0].availability;
      }
    }

    // Extract rating if available (handle both primitive and object structures)
    let rating = null;
    const starRating = product.customerReviews?.starRating;
    if (starRating != null) {
      if (typeof starRating === 'number') {
        rating = starRating;
      } else if (typeof starRating === 'object') {
        rating =
          starRating.value ??
          (starRating.displayValue ? parseFloat(starRating.displayValue) : null);
      } else if (typeof starRating === 'string') {
        rating = parseFloat(starRating) || null;
      }
    }

    // Extract rating count if available (handle both primitive and object structures)
    let ratingCount = null;
    const reviewCount = product.customerReviews?.count ?? product.customerReviews?.reviewsCount;
    if (reviewCount != null) {
      if (typeof reviewCount === 'number') {
        ratingCount = reviewCount;
      } else if (typeof reviewCount === 'object') {
        ratingCount = reviewCount.value ?? reviewCount.displayValue ?? null;
      } else if (typeof reviewCount === 'string') {
        ratingCount = parseInt(reviewCount, 10) || null;
      }
    }

    // Generate affiliate links with all options
    const affiliateLinks = this.buildAffiliateLink(product.asin, options);

    // Return COMPLETE product object with all API data
    return {
      // Basic Product Info
      asin: product.asin,
      parentASIN: product.parentASIN || null,
      title: product.itemInfo?.title?.displayValue || 'N/A',

      // Pricing and Availability
      price: price,
      originalPrice: null, // Not available from API
      discountAmount: null, // Not available from API
      discountPercentage: null, // Not available from API
      currency: currency || 'EUR',
      availability: availability || null,

      // Customer Reviews
      rating: rating,
      ratingCount: ratingCount,

      // Product Details
      features: product.itemInfo?.features?.displayValues || [],

      // Images
      image: {
        small: product.images?.primary?.small?.url || null,
        large: product.images?.primary?.large?.url || null,
      },

      // Affiliate Links (All formats)
      affiliateLinks: affiliateLinks,

      // Raw API response (complete data for future filtering)
      rawData: {
        itemInfo: product.itemInfo || null,
        images: product.images || null,
        offersV2: product.offersV2 || null,
        customerReviews: product.customerReviews || null,
        detailPageURL: product.detailPageURL || null,
      },

      // Metadata
      fetchedAt: new Date().toISOString(),
      marketplace: config.amazon.marketplace,
    };
  }

  /**
   * Build affiliate link from ASIN with optimized structure
   *
   * DEEP LINKING NOTE:
   * Amazon handles deep linking natively via iOS Universal Links and Android App Links.
   * A standard HTTPS link to amazon.it is automatically intercepted by the Amazon app
   * (if installed) on both iOS and Android — no custom schemes (amazon://, amzn://) needed.
   * This is the officially recommended approach by Amazon.
   *
   * @param {string} asin - Product ASIN
   * @param {Object} options - Link generation options
   * @param {string} options.storefront - Your storefront ID to show in storefront mode
   * @param {string} options.ref - Custom reference tag for tracking
   * @returns {Object} - Object with link formats: { web, storefront }
   */
  buildAffiliateLink(asin, options = {}) {
    const marketplace = config.amazon.marketplace.toLowerCase();
    const baseUrl = `https://www.amazon.${marketplace}`;
    const partnerTag = config.amazon.partnerTag;
    const language = this.getMarketplaceLanguage();

    const links = {
      // Universal affiliate link — works as deep link on iOS/Android (app opens automatically)
      web: this.buildWebLink(baseUrl, asin, partnerTag, language, options.ref),

      // Storefront link (if storefront ID provided)
      storefront: options.storefront
        ? this.buildStorefrontLink(baseUrl, asin, options.storefront, partnerTag)
        : null,
    };

    return links;
  }

  /**
   * Build optimized web affiliate link
   * Format: https://www.amazon.it/dp/{ASIN}/?tag={tag}&linkCode=ll1&language=it_IT
   *
   * - tag: affiliate partner tag (required)
   * - linkCode: identifies link source (ll1 = text link from Link Builder)
   * - language: forces page language for consistent user experience
   * - ref: optional custom tracking reference
   */
  buildWebLink(baseUrl, asin, partnerTag, language, ref = null) {
    let url = `${baseUrl}/dp/${asin}/?tag=${partnerTag}&linkCode=ll1&language=${language}`;
    if (ref) {
      url += `&ref=${encodeURIComponent(ref)}`;
    }
    return url;
  }

  /**
   * Get marketplace language code for URL parameter
   */
  getMarketplaceLanguage() {
    const languageMap = {
      IT: 'it_IT',
      US: 'en_US',
      UK: 'en_GB',
      DE: 'de_DE',
      FR: 'fr_FR',
      ES: 'es_ES',
    };
    return languageMap[this.marketplace] || languageMap.IT;
  }

  /**
   * Build storefront link - redirect to your storefront with this product promoted
   */
  buildStorefrontLink(baseUrl, asin, storefrontId, partnerTag) {
    return `${baseUrl}/services/storefront?storefront_id=${storefrontId}&asins=${asin}&tag=${partnerTag}`;
  }

  /**
   * Utility: Split array into chunks
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Utility: Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const amazonService = new AmazonService();

// Test execution if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const testAsins = ['B0DHRQ2XGJ', 'B08N5WRWNW'];

  amazonService
    .getProductDetails(testAsins)
    .then(products => {
      console.log('\n✅ Test completed: fetched', products.length, 'products');
    })
    .catch(console.error);
}
