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
  detectMissingCategories,
  extractAsinsOnly,
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
  waitForProducts,
} from './keepa-page.js';
import {
  enrichProducts,
  setupForProductPages,
  type ProductPageData,
} from './keepa-product-page.js';

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

// ─── Recovery for product page navigation (lighter than full deals setup) ────

async function recoverForProductPages(
  heartbeat: MouseHeartbeat,
  oldBrowser: Browser | undefined
): Promise<{ browser: Browser; page: Page }> {
  logger.info('Starting product-page recovery — fresh browser session');
  await closeBrowser(oldBrowser);

  const { browser, page } = await launchBrowser();
  heartbeat.updatePage(page);
  heartbeat.start(page);

  await setupForProductPages(page);

  logger.info('Product-page recovery complete');
  return { browser, page };
}

// ─── Phase 3: enrich products with review data via product page navigation ───

async function enrichWithReviews(
  page: Page,
  browser: Browser,
  heartbeat: MouseHeartbeat,
  products: KeepaProduct[]
): Promise<{ activePage: Page; activeBrowser: Browser }> {
  const asins = products.map(p => p.asin);
  let activePage = page;
  let activeBrowser = browser;
  const allData = new Map<string, ProductPageData>();
  let toProcess = [...asins];
  let retries = 0;
  const MAX_RETRIES = 2;

  while (toProcess.length > 0 && retries <= MAX_RETRIES) {
    if (!(await isPageAlive(activePage))) {
      logger.warn('Page dead before enrichment batch — recovering');
      try {
        const recovered = await recoverForProductPages(heartbeat, activeBrowser);
        activeBrowser = recovered.browser;
        activePage = recovered.page;
        retries++;
      } catch (err) {
        logger.error(
          { err: (err as Error).message },
          'Product-page recovery failed — aborting enrichment'
        );
        break;
      }
    }

    const { data: batchResults } = await enrichProducts(activePage, toProcess);

    for (const [asin, pageData] of batchResults) {
      allData.set(asin, pageData);
    }

    const processed = new Set(batchResults.keys());
    const remaining = toProcess.filter(a => !processed.has(a));

    if (remaining.length === toProcess.length) {
      logger.warn({ remaining: remaining.length }, 'No progress in enrichment batch — stopping');
      break;
    }

    toProcess = remaining;
    if (toProcess.length > 0) retries++;
  }

  // Merge enrichment data back into products
  for (const product of products) {
    const data = allData.get(product.asin);
    if (data) {
      if (data.rating !== undefined) product.rating = data.rating;
      if (data.reviewCount !== undefined) product.reviewCount = data.reviewCount;
    }
  }

  logger.info(
    { enriched: allData.size, total: asins.length, missing: asins.length - allData.size },
    'Phase 3 review enrichment complete'
  );

  return { activePage, activeBrowser };
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

  const categoryIds = [...config.keepa.categories];
  const MAX_CATEGORY_RETRIES = 1;
  const categoryRetries = new Map<number, number>();

  for (let catIdx = 0; catIdx < categoryIds.length; catIdx++) {
    const categoryId = categoryIds[catIdx];
    const categoryName = CATEGORY_NAMES[categoryId];
    if (!categoryName) {
      logger.warn({ categoryId }, 'Category ID not in CATEGORY_NAMES');
      continue;
    }

    // Check page health before each category
    if (!(await isPageAlive(activePage))) {
      const retries = categoryRetries.get(catIdx) ?? 0;
      if (retries >= MAX_CATEGORY_RETRIES) {
        logger.warn({ category: categoryName, retries }, 'Max retries reached — skipping category');
        continue;
      }

      logger.error({ category: categoryName }, 'Page dead — recovering');
      try {
        const recovered = await recoverSession(heartbeat, activeBrowser, {
          lowestEver: options.isLowest,
        });
        activeBrowser = recovered.browser;
        activePage = recovered.page;
        categoryRetries.set(catIdx, retries + 1);
        catIdx--;
        continue;
      } catch (err) {
        logger.error({ err: (err as Error).message }, 'Recovery failed — aborting');
        break;
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

        // Timeout may indicate a dead page — check and recover if needed
        if (!(await isPageAlive(activePage))) {
          const retries = categoryRetries.get(catIdx) ?? 0;
          if (retries < MAX_CATEGORY_RETRIES) {
            logger.error(
              { category: categoryName },
              'Page died during category switch — recovering'
            );
            try {
              const recovered = await recoverSession(heartbeat, activeBrowser, {
                lowestEver: options.isLowest,
              });
              activeBrowser = recovered.browser;
              activePage = recovered.page;
              categoryRetries.set(catIdx, retries + 1);
              catIdx--; // Retry this category
              continue;
            } catch (recErr) {
              logger.error(
                { err: (recErr as Error).message },
                'Recovery after timeout failed — aborting'
              );
              break;
            }
          } else {
            logger.warn(
              { category: categoryName, retries },
              'Page dead after timeout but max retries reached — skipping'
            );
          }
        }
        continue;
      }

      await takeScreenshot(activePage, `${passLabel}_cat_${categoryId}_loaded`);

      if (options.extractDetails) {
        // Phase 1: collect product data from deals page (reviews enriched in Phase 3)
        const productLinks = await extractProductLinks(activePage);
        const targetCount = config.keepa.maxProductsPerCategory;

        logger.info(
          { found: productLinks.length, target: targetCount, category: categoryName },
          'Products found on page'
        );

        const categoryProducts: KeepaProduct[] = [];
        let skippedUnchanged = 0;

        for (let i = 0; i < productLinks.length && categoryProducts.length < targetCount; i++) {
          const { asin, discount, avgPrice, currentPrice } = productLinks[i];

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

            categoryProducts.push({
              asin,
              category: categoryName,
              discount,
              avgPrice,
              currentPrice,
              rating: undefined,
              reviewCount: undefined,
              isLowest: options.isLowest,
            });

            logger.info({ asin, currentPrice, avgPrice, discount }, 'Product collected');
          } catch (error) {
            logger.warn({ asin, err: (error as Error).message }, 'Error checking product');
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
        const retries = categoryRetries.get(catIdx) ?? 0;
        if (retries < MAX_CATEGORY_RETRIES) {
          try {
            const recovered = await recoverSession(heartbeat, activeBrowser, {
              lowestEver: options.isLowest,
            });
            activeBrowser = recovered.browser;
            activePage = recovered.page;
            categoryRetries.set(catIdx, retries + 1);
            catIdx--; // Retry this category
            logger.info({ category: categoryName }, 'Will retry after recovery');
          } catch (recErr) {
            logger.error({ err: (recErr as Error).message }, 'Recovery failed — aborting');
            break;
          }
        } else {
          logger.warn(
            { category: categoryName, retries },
            'Page dead but max retries reached — skipping category'
          );
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

    // ── Phase 3: Enrich products with review data via product pages ──────
    if (allProducts.length > 0 && (await isPageAlive(page))) {
      logger.info({ count: allProducts.length }, 'Phase 3: enriching products with review data');
      try {
        const enrichResult = await enrichWithReviews(page, browser, heartbeat, allProducts);
        browser = enrichResult.activeBrowser;
        page = enrichResult.activePage;
      } catch (error) {
        logger.warn(
          { err: (error as Error).message },
          'Phase 3 enrichment failed — products saved without review data'
        );
      }
    } else if (allProducts.length > 0) {
      logger.warn('Page not alive after Pass 2 — skipping Phase 3 enrichment');
    }

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
