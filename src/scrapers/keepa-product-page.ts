/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import type { Page } from 'rebrowser-puppeteer-core';
import { createComponentLogger } from '../utils/logger.js';
import { simulateMouseBurst } from './browser.js';
import { ensureChartBlocker, selectAmazonItDomain, takeErrorScreenshot } from './keepa-page.js';

const logger = createComponentLogger('KeepaProductPage');

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

// ─── Product page data ───────────────────────────────────────────────────────

export interface ProductPageData {
  rating: number | undefined;
  reviewCount: number | undefined;
  currentPrice: number | undefined;
}

// ─── Lightweight setup for product page navigation ───────────────────────────
// Much lighter than setupDealsPage — no filters, no "Find Deals" click.
// Just enough to pass Cloudflare and have the SPA router ready.

export async function setupForProductPages(page: Page): Promise<void> {
  logger.info('Setting up browser for product page navigation');

  await page
    .goto('https://keepa.com/', { waitUntil: 'networkidle2', timeout: 30_000 })
    .catch(err => logger.warn({ err: (err as Error).message }, 'Homepage navigation timeout'));
  await delay(2000);

  await selectAmazonItDomain(page);
  await simulateMouseBurst(page);

  // Wait for SPA to fully initialize
  await delay(5000);
  await ensureChartBlocker(page);

  logger.info('Product page navigation setup complete');
}

// ─── Navigate to a single product page ───────────────────────────────────────

export async function navigateToProduct(page: Page, asin: string): Promise<boolean> {
  try {
    await ensureChartBlocker(page);

    // SPA hash navigation — Keepa handles the route change internally.
    // This replaces the current view (deals list or previous product) with the
    // product detail view. No full page reload, no new Cloudflare challenge.
    await page.evaluate((targetAsin: string) => {
      window.location.hash = `!product/8-${targetAsin}`;
    }, asin);

    // Let the SPA router render the new product view
    await delay(2000);
    return true;
  } catch (err) {
    logger.warn({ asin, err: (err as Error).message }, 'Failed to navigate to product page');
    return false;
  }
}

// ─── Wait for product page content ──────────────────────────────────────────

export async function waitForProductPage(page: Page, maxWaitMs = 15_000): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const ready = await page
      .evaluate(() => {
        const infoBox = document.getElementById('productInfoBox');
        if (!infoBox) return false;
        const text = infoBox.textContent?.trim() ?? '';
        return text.length > 20;
      })
      .catch(() => false);

    if (ready) return true;
    await delay(500);
  }

  return false;
}

// ─── Extract review data + current price from a loaded product page ─────────

export async function extractProductPageData(page: Page): Promise<ProductPageData> {
  return page
    .evaluate(
      (): { rating: number | null; reviewCount: number | null; currentPrice: number | null } => {
        const data: {
          rating: number | null;
          reviewCount: number | null;
          currentPrice: number | null;
        } = { rating: null, reviewCount: null, currentPrice: null };

        // ── Rating + review count from #productInfoBox ──────────────────
        const infoBox = document.getElementById('productInfoBox');
        if (infoBox) {
          const firstDiv = infoBox.querySelector('div');
          if (firstDiv) {
            const fullText = firstDiv.textContent?.trim() ?? '';

            // Rating: color-coded span or text pattern
            const ratingSpan = firstDiv.querySelector(
              'span[style*="color:#cea000"], span[style*="color: #cea000"]'
            );
            if (ratingSpan) {
              const parsed = parseFloat(ratingSpan.textContent?.trim()?.replace(',', '.') ?? '');
              if (!isNaN(parsed) && parsed >= 0 && parsed <= 5) data.rating = parsed;
            }
            if (data.rating === null) {
              const ratingMatch = fullText.match(/(\d+[.,]\d+)\s*(?:su\s*\d+\s*)?(stelle|stars?)/i);
              if (ratingMatch) {
                const parsed = parseFloat(ratingMatch[1].replace(',', '.'));
                if (parsed >= 0 && parsed <= 5) data.rating = parsed;
              }
            }
            if (data.rating === null) {
              const fallback = fullText.match(/(\d+[.,]\d+)(?!\s*(?:cm|mm|kg|x|×|€))/);
              if (fallback) {
                const parsed = parseFloat(fallback[1].replace(',', '.'));
                if (parsed >= 0 && parsed <= 5) data.rating = parsed;
              }
            }

            // Review count: "(N recensioni)" or "(N valutazioni)"
            const reviewPatterns = [
              /\((\d[\d.,]*)\s*(?:recensioni|valutazioni|reviews?|ratings?|Bewertungen)/i,
              /(?:stelle|stars?)\s*\((\d[\d.,]*)\)/i,
            ];
            for (const pattern of reviewPatterns) {
              const m = fullText.match(pattern);
              if (m) {
                const raw = (m[1] ?? '').replace(/[.,]/g, '');
                const parsed = parseInt(raw, 10);
                if (!isNaN(parsed) && parsed > 0) {
                  data.reviewCount = parsed;
                  break;
                }
              }
            }
          }
        }

        // ── Current Amazon price from .priceAmazon ──────────────────────
        const priceSpan = document.querySelector(
          '.productTableDescriptionPriceAlt.priceAmazon span'
        );
        if (priceSpan) {
          const priceText = priceSpan.textContent?.trim() ?? '';
          const priceMatch = priceText.match(/(\d+[.,]\d+)/);
          if (priceMatch) {
            data.currentPrice = parseFloat(priceMatch[1].replace(',', '.'));
          }
        }

        return data;
      }
    )
    .then(d => ({
      rating: d.rating ?? undefined,
      reviewCount: d.reviewCount ?? undefined,
      currentPrice: d.currentPrice ?? undefined,
    }))
    .catch(() => ({ rating: undefined, reviewCount: undefined, currentPrice: undefined }));
}

// ─── Batch enrichment: visit product pages and extract data ─────────────────

export interface EnrichmentResult {
  data: Map<string, ProductPageData>;
  /** Number of ASINs that failed (navigated but couldn't extract data). */
  failedCount: number;
}

export async function enrichProducts(page: Page, asins: string[]): Promise<EnrichmentResult> {
  const data = new Map<string, ProductPageData>();
  let consecutiveFailures = 0;
  let failedCount = 0;
  const MAX_CONSECUTIVE_FAILURES = 3;

  for (const asin of asins) {
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      logger.warn(
        { consecutiveFailures, remaining: asins.length - data.size - failedCount },
        'Too many consecutive failures — stopping enrichment batch'
      );
      break;
    }

    try {
      const navigated = await navigateToProduct(page, asin);
      if (!navigated) {
        consecutiveFailures++;
        failedCount++;
        await takeErrorScreenshot(page, `product_nav_failed_${asin}`);
        continue;
      }

      const ready = await waitForProductPage(page);
      if (!ready) {
        consecutiveFailures++;
        failedCount++;
        logger.warn({ asin }, 'Product page did not load');
        await takeErrorScreenshot(page, `product_page_timeout_${asin}`);
        continue;
      }

      const pageData = await extractProductPageData(page);
      data.set(asin, pageData);

      logger.info(
        {
          asin,
          rating: pageData.rating,
          reviewCount: pageData.reviewCount,
          price: pageData.currentPrice,
        },
        'Product page data extracted'
      );

      consecutiveFailures = 0;
      await delay(1000);
    } catch (err) {
      consecutiveFailures++;
      failedCount++;
      logger.warn({ asin, err: (err as Error).message }, 'Error enriching product');
      await takeErrorScreenshot(page, `product_enrich_error_${asin}`).catch(() => {});
    }
  }

  return { data, failedCount };
}
