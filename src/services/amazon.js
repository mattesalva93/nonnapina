import axios from 'axios';
import { config } from '../config/index.js';

/**
 * Amazon Creators API client for fetching product information
 * Uses OAuth 2.0 token-based authentication
 */
class AmazonService {
  constructor() {
    // Debug: Log credentials (first chars only for security)
    console.log('\n🔐 Checking Amazon Creators API credentials...');
    console.log(
      '   Client ID:',
      config.amazon.accessKey ? `${config.amazon.accessKey.substring(0, 5)}...` : 'NOT SET ❌'
    );
    console.log(
      '   Client Secret:',
      config.amazon.secretKey ? `${config.amazon.secretKey.substring(0, 5)}...` : 'NOT SET ❌'
    );
    console.log('   Partner Tag:', config.amazon.partnerTag || 'NOT SET ❌');
    console.log('   Marketplace:', config.amazon.marketplace || 'NOT SET ❌');
    console.log('   Using Creators API with OAuth 2.0\n');

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
      console.log('🔐 Fetching OAuth 2.0 access token...');

      const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

      console.log('   📨 Token endpoint:', this.tokenEndpoint);
      console.log('   🔑 Client ID (first 10 chars):', this.clientId.substring(0, 10) + '...');

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

      console.log('✅ Access token obtained (expires in', response.data.expires_in, 'seconds)');
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
   * @returns {Promise<Array>}
   */
  async getProductDetails(asins) {
    console.log(`\n🔍 Fetching details for ${asins.length} products from Amazon Creators API...`);

    const BATCH_SIZE = 10; // Creators API batch size
    const batches = this.chunkArray(asins, BATCH_SIZE);
    const allProducts = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`📦 Processing batch ${i + 1}/${batches.length} (${batch.length} items)`);

      try {
        const products = await this.fetchProductBatch(batch);
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
  async fetchProductBatch(asins) {
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

      console.log('📤 Sending request:');
      console.log('   Endpoint:', `${this.apiBaseUrl}/catalog/v1/getItems`);
      console.log('   Marketplace URL:', this.getMarketplaceUrl());
      console.log('   Partner Tag:', this.partnerTag);
      console.log('   Items count:', asins.length);
      console.log('   Token (first 20 chars):', accessToken.substring(0, 20) + '...');

      const response = await axios.post(`${this.apiBaseUrl}/catalog/v1/getItems`, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}, Version 2.2`,
          'x-marketplace': this.getMarketplaceUrl(),
        },
        timeout: 10000,
      });

      // Map response to expected format
      if (response.data?.itemsResult?.items) {
        return response.data.itemsResult.items.map(product => this.formatProduct(product));
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
   * Format product data from Creators API response
   */
  formatProduct(product) {
    // Extract pricing from offersV2 if available, otherwise null
    let price = null;
    let currency = null;
    if (product.offersV2?.listings?.[0]?.price) {
      price = product.offersV2.listings[0].price.amount;
      currency = product.offersV2.listings[0].price.currency;
    }

    // Extract rating if available
    let rating = null;
    if (product.customerReviews?.starRating) {
      rating = product.customerReviews.starRating;
    }

    // Extract rating count if available
    let ratingCount = null;
    if (product.customerReviews?.count) {
      ratingCount = product.customerReviews.count;
    }

    return {
      asin: product.asin,
      title: product.itemInfo?.title?.displayValue || 'N/A',
      price: price,
      currency: currency || 'EUR',
      rating: rating,
      ratingCount: ratingCount,
      features: product.itemInfo?.features?.displayValues || [],
      image: product.images?.primary?.large?.url || product.images?.primary?.small?.url || null,
      url: this.buildAffiliateLink(product.asin),
      detailPageURL: product.detailPageURL || null,
      parentASIN: product.parentASIN || null,
    };
  }

  /**
   * Build affiliate link from ASIN
   * @param {string} asin
   * @returns {string}
   */
  buildAffiliateLink(asin) {
    const marketplace = config.amazon.marketplace.toLowerCase();
    return `https://www.amazon.${marketplace}/dp/${asin}?tag=${config.amazon.partnerTag}`;
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
      console.log('\n📋 Product details:', JSON.stringify(products, null, 2));
    })
    .catch(console.error);
}
