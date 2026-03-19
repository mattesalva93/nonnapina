/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import path from 'node:path';
import type { Browser, Page } from 'rebrowser-puppeteer-core';
import { config } from '../config/index.js';
import { sendErrorAlert, sendMissingCategoriesEmail } from '../services/email.service.js';
import { checkDealDuplicate } from '../services/product.service.js';
import type { KeepaProduct, ScrapeResult } from '../types/index.js';
import { createComponentLogger } from '../utils/logger.js';
import {
  closeBrowser,
  isPageAlive,
  launchBrowser,
  MouseHeartbeat,
  simulateMouseBurst,
} from './browser.js';
import {
  applyDealFilters,
  CATEGORY_NAMES,
  clickCategory,
  clickFindDeals,
  clickProductOverlay,
  closeProductOverlay,
  detectMissingCategories,
  extractAsinsOnly,
  extractProductDetail,
  extractProductLinks,
  getFirstVisibleAsin,
  getLatestScreenshots,
  resetScreenshots,
  selectAmazonItDomain,
  selectItalianLanguage,
  takeErrorScreenshot,
  takeScreenshot,
  toggleLowestFilter,
  verifyAndFixLanguage,
  verifyDomain,
  waitForCategoryLinks,
  waitForCategorySwitch,
  waitForDealsUI,
  waitForProductOverlay,
  waitForProducts,
} from './keepa-page.js';

const logger = createComponentLogger('KeepaService');

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

// ─── Setup: navigate to deals page, set domain/lang/filters ──────────────────

async function setupDealsPage(page: Page, options: { lowestEver?: boolean } = {}): Promise<void> {
  // Navigate to homepage to set domain
  logger.info('Navigating to Keepa homepage');
  await page
    .goto('https://keepa.com/', { waitUntil: 'networkidle2', timeout: 30000 })
    .catch(err => logger.warn({ err: (err as Error).message }, 'Homepage navigation timeout'));
  await delay(2000);

  await selectAmazonItDomain(page);

  // Navigate to deals page
  logger.info('Navigating to Deals page');
  await page
    .goto('https://keepa.com/#!deals', { waitUntil: 'networkidle2', timeout: 60000 })
    .catch(err => logger.warn({ err: (err as Error).message }, 'Deals page navigation timeout'));

  // Mouse movement triggers Cloudflare Turnstile challenge
  await simulateMouseBurst(page);

  await waitForDealsUI(page, 'setup');

  // SPA needs time after button appears before JS handlers bind
  await delay(5000);

  await selectItalianLanguage(page);
  await verifyDomain(page);

  // Wait for deals UI again after lang change (SPA reloads)
  await waitForDealsUI(page, 'post-lang');

  await applyDealFilters(page, { lowestEver: options.lowestEver ?? false });

  await clickFindDeals(page);

  const ready = await waitForProducts(page);
  if (!ready) {
    await takeErrorScreenshot(page, 'setup_products_timeout');
    logger.warn('Products did not load during setup');
  }

  await waitForCategoryLinks(page);
  await verifyAndFixLanguage(page);

  await takeScreenshot(page, 'setup_complete');
  logger.info('Deals page setup complete');
}

// ─── Recovery: fresh browser + full setup ────────────────────────────────────

async function recoverSession(
  heartbeat: MouseHeartbeat,
  oldBrowser: Browser | undefined,
  options: { lowestEver?: boolean } = {}
): Promise<{ browser: Browser; page: Page }> {
  logger.info('Starting recovery — fresh browser session');
  await closeBrowser(oldBrowser);

  const { browser, page } = await launchBrowser();
  heartbeat.updatePage(page);
  heartbeat.start(page);

  await setupDealsPage(page, options);

  logger.info('Recovery complete');
  return { browser, page };
}

// ─── Product scraping with overlay click per product ─────────────────────────

async function scrapeProductDetail(
  page: Page,
  productIndex: number,
  asin: string
): Promise<{ rating: number | undefined; reviewCount: number | undefined }> {
  const clicked = await clickProductOverlay(page, productIndex);
  if (!clicked) {
    logger.warn({ asin, index: productIndex }, 'Could not click product overlay');
    await takeErrorScreenshot(page, `overlay_click_failed_${asin}`);
    return { rating: undefined, reviewCount: undefined };
  }

  try {
    const overlayReady = await waitForProductOverlay(page);
    if (!overlayReady) {
      logger.warn({ asin }, 'Product overlay did not open');
      await takeErrorScreenshot(page, `overlay_not_open_${asin}`);
      return { rating: undefined, reviewCount: undefined };
    }

    await takeScreenshot(page, `product_${asin}_overlay`);

    const detail = await extractProductDetail(page);
    logger.debug(
      { asin, rating: detail.rating, reviewCount: detail.reviewCount },
      'Product detail extracted'
    );

    // Brief pause after extraction before closing — let SPA breathe
    await delay(500);

    return { rating: detail.rating, reviewCount: detail.reviewCount };
  } finally {
    await closeProductOverlay(page);
  }
}

// ─── Category iteration (shared between pass 1 and pass 2) ──────────────────

interface CategoryScrapeOptions {
  extractDetails: boolean;
  isLowest: boolean;
}

interface CategoryScrapeResult {
  products: KeepaProduct[];
  asins: Set<string>;
}

async function scrapeCategories(
  page: Page,
  browser: Browser,
  heartbeat: MouseHeartbeat,
  options: CategoryScrapeOptions
): Promise<{
  result: CategoryScrapeResult;
  activePage: Page;
  activeBrowser: Browser;
}> {
  const products: KeepaProduct[] = [];
  const allAsins = new Set<string>();

  let activePage = page;
  let activeBrowser = browser;
  let overlaysSinceRecovery = 0;
  const MAX_OVERLAYS_BEFORE_RECOVERY = 10;

  const categoryIds = [...config.keepa.categories];

  for (let catIdx = 0; catIdx < categoryIds.length; catIdx++) {
    const categoryId = categoryIds[catIdx];
    const categoryName = CATEGORY_NAMES[categoryId];
    if (!categoryName) {
      logger.warn({ categoryId }, 'Category ID not in CATEGORY_NAMES');
      continue;
    }

    // Check page health before each category
    if (!(await isPageAlive(activePage))) {
      logger.error('Page dead — recovering');
      try {
        const recovered = await recoverSession(heartbeat, activeBrowser, {
          lowestEver: options.isLowest,
        });
        activeBrowser = recovered.browser;
        activePage = recovered.page;
        overlaysSinceRecovery = 0;
        // Retry this category
        catIdx--;
        continue;
      } catch (err) {
        logger.error({ err: (err as Error).message }, 'Recovery failed — aborting');
        break;
      }
    }

    // Proactive recovery: fresh browser to prevent memory buildup from Keepa charts
    if (options.extractDetails && overlaysSinceRecovery >= MAX_OVERLAYS_BEFORE_RECOVERY) {
      logger.info(
        { overlaysSinceRecovery },
        'Proactive recovery — refreshing browser to prevent memory pressure'
      );
      try {
        const recovered = await recoverSession(heartbeat, activeBrowser, {
          lowestEver: options.isLowest,
        });
        activeBrowser = recovered.browser;
        activePage = recovered.page;
        overlaysSinceRecovery = 0;
      } catch (err) {
        logger.error({ err: (err as Error).message }, 'Proactive recovery failed — continuing');
      }
    }

    const passLabel = options.isLowest ? 'lowest' : 'normal';
    logger.info({ category: categoryName, pass: passLabel }, 'Processing category');

    try {
      const previousAsin = await getFirstVisibleAsin(activePage);
      const clicked = await clickCategory(activePage, categoryName);

      if (!clicked) {
        await takeErrorScreenshot(activePage, `${passLabel}_cat_${categoryId}_not_found`);
        continue;
      }

      await takeScreenshot(activePage, `${passLabel}_cat_${categoryId}_clicked`);

      const switched = await waitForCategorySwitch(activePage, previousAsin);
      if (!switched) {
        logger.warn({ category: categoryName }, 'Timeout waiting for category switch');
        await takeErrorScreenshot(activePage, `${passLabel}_cat_${categoryId}_timeout`);
        continue;
      }

      await takeScreenshot(activePage, `${passLabel}_cat_${categoryId}_loaded`);

      if (options.extractDetails) {
        // Full scrape: extract product links, then click each for review data
        const productLinks = await extractProductLinks(activePage);
        const targetCount = config.keepa.maxProductsPerCategory;

        logger.info(
          { found: productLinks.length, target: targetCount, category: categoryName },
          'Products found on page'
        );

        const categoryProducts: KeepaProduct[] = [];
        let skippedUnchanged = 0;
        let consecutiveFailures = 0;
        const MAX_CONSECUTIVE_FAILURES = 3;

        for (let i = 0; i < productLinks.length && categoryProducts.length < targetCount; i++) {
          const { asin, containerIndex, discount, avgPrice, currentPrice } = productLinks[i];

          // If too many consecutive failures, the page is likely unresponsive — break and recover
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            logger.warn(
              { consecutiveFailures, category: categoryName },
              'Too many consecutive failures — breaking product loop'
            );
            break;
          }

          try {
            const dupCheck = await checkDealDuplicate(asin, {
              avgPrice,
              currentPrice,
              discount,
            });

            if (dupCheck.status === 'unchanged') {
              skippedUnchanged++;
              logger.debug({ asin }, 'Skipping unchanged product');
              continue;
            }

            // Extract review data via overlay click
            const reviewData = await scrapeProductDetail(activePage, containerIndex, asin);
            overlaysSinceRecovery++;

            categoryProducts.push({
              asin,
              category: categoryName,
              discount,
              avgPrice,
              currentPrice,
              rating: reviewData.rating,
              reviewCount: reviewData.reviewCount,
              isLowest: options.isLowest,
            });

            logger.info(
              {
                asin,
                currentPrice,
                avgPrice,
                discount,
                rating: reviewData.rating,
                reviewCount: reviewData.reviewCount,
              },
              'Product scraped'
            );

            consecutiveFailures = 0;
          } catch (error) {
            consecutiveFailures++;
            await takeErrorScreenshot(activePage, `product_error_${asin}`);
            logger.warn(
              { asin, err: (error as Error).message, consecutiveFailures },
              'Error processing product'
            );
          }
        }

        logger.info(
          {
            new: categoryProducts.length,
            skippedUnchanged,
            totalOnPage: productLinks.length,
            category: categoryName,
          },
          'Category extraction complete'
        );

        // Deduplicate by ASIN
        for (const product of categoryProducts) {
          if (!products.find(p => p.asin === product.asin)) {
            products.push(product);
            allAsins.add(product.asin);
          }
        }

        // If we broke out due to failures, recover before next category
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          logger.info('Triggering recovery after consecutive failures');
          const recovered = await recoverSession(heartbeat, activeBrowser, {
            lowestEver: options.isLowest,
          });
          activeBrowser = recovered.browser;
          activePage = recovered.page;
          overlaysSinceRecovery = 0;
        }
      } else {
        // ASINs-only pass: just collect visible ASINs
        const asins = await extractAsinsOnly(activePage);
        for (const asin of asins) allAsins.add(asin);
        logger.info({ category: categoryName, asinCount: asins.length }, 'Lowest ASINs collected');
      }

      await delay(config.keepa.scrapingDelayMs);
    } catch (error) {
      logger.error(
        { category: categoryName, err: (error as Error).message },
        'Category processing failed'
      );

      // Check if page died and trigger recovery
      if (!(await isPageAlive(activePage))) {
        try {
          const recovered = await recoverSession(heartbeat, activeBrowser, {
            lowestEver: options.isLowest,
          });
          activeBrowser = recovered.browser;
          activePage = recovered.page;
          catIdx--; // Retry this category
          logger.info({ category: categoryName }, 'Will retry after recovery');
        } catch (recErr) {
          logger.error({ err: (recErr as Error).message }, 'Recovery failed — aborting');
          break;
        }
      }
    }
  }

  return {
    result: { products, asins: allAsins },
    activePage,
    activeBrowser,
  };
}

// ─── Merge: deduplicate by ASIN, prefer lowest-pass products ─────────────────

export function mergeResults(
  normalProducts: KeepaProduct[],
  lowestAsins: Set<string>
): KeepaProduct[] {
  return normalProducts.map(p => ({
    ...p,
    isLowest: lowestAsins.has(p.asin),
  }));
}

// Keep backward-compatible export name
export const mergeLowestFlags = mergeResults;

// ─── Main entry point ────────────────────────────────────────────────────────

export { getLatestScreenshots } from './keepa-page.js';

export async function scrapeKeepaDeals(): Promise<ScrapeResult> {
  logger.info('Starting Keepa scraper');

  let browser: Browser | undefined;
  let page: Page | undefined;
  const heartbeat = new MouseHeartbeat();

  try {
    await resetScreenshots();

    const launched = await launchBrowser();
    browser = launched.browser;
    page = launched.page;
    logger.info('Browser launched');

    // Start heartbeat immediately — keeps Cloudflare happy
    heartbeat.start(page);

    // Full setup: domain, language, filters, find deals
    await setupDealsPage(page, { lowestEver: false });

    // Detect unmapped categories (email alert)
    await detectMissingCategories(page, sendMissingCategoriesEmail);

    // ── Pass 1: Normal scraping (Minimo OFF) ─────────────────────────────
    logger.info('Pass 1: normal deal scraping');
    const {
      result: pass1Result,
      activePage: pageAfterPass1,
      activeBrowser: browserAfterPass1,
    } = await scrapeCategories(page, browser, heartbeat, {
      extractDetails: true,
      isLowest: false,
    });

    browser = browserAfterPass1;
    page = pageAfterPass1;

    // ── Pass 2: Enable "Minimo" filter, collect ASINs only ───────────────
    logger.info('Pass 2: collecting lowest-ever ASINs');
    let lowestAsins = new Set<string>();

    if (await isPageAlive(page)) {
      try {
        await toggleLowestFilter(page, true);
        await clickFindDeals(page);
        await waitForProducts(page);
        await delay(2000);

        const {
          result: pass2Result,
          activePage: pageAfterPass2,
          activeBrowser: browserAfterPass2,
        } = await scrapeCategories(page, browser, heartbeat, {
          extractDetails: false,
          isLowest: true,
        });

        lowestAsins = pass2Result.asins;
        browser = browserAfterPass2;
        page = pageAfterPass2;
      } catch (error) {
        logger.warn({ err: (error as Error).message }, 'Error in pass 2');
      }
    } else {
      logger.warn('Page not alive — skipping pass 2');
    }

    // ── Merge: flag pass 1 products that appear in lowest results ────────
    const allProducts = mergeResults(pass1Result.products, lowestAsins);

    const upgradedCount = allProducts.filter(p => p.isLowest).length;
    logger.info(
      {
        pass1: pass1Result.products.length,
        lowestAsinsFound: lowestAsins.size,
        upgradedToLowest: upgradedCount,
        total: allProducts.length,
      },
      'Both passes complete — merged results'
    );

    heartbeat.stop();
    await closeBrowser(browser);

    return { products: allProducts, lowestAsins };
  } catch (error) {
    heartbeat.stop();

    const message = (error as Error).message;
    logger.error({ err: message, stack: (error as Error).stack }, 'Keepa scraping failed');

    const screenshots = await getLatestScreenshots(4);
    void sendErrorAlert({
      errorMessage: `Keepa scraping failed: ${message}`,
      errorStack: (error as Error).stack,
      component: 'KeepaService',
      severity: 'critical',
      attachments: screenshots.map(filepath => ({
        filename: path.basename(filepath),
        path: path.resolve(filepath),
      })),
    });

    await closeBrowser(browser);
    throw error;
  }
}
