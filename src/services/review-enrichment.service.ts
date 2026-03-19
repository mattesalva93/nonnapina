import type { Browser, Page } from 'rebrowser-puppeteer-core';
import { closeBrowser, isPageAlive, launchBrowser, MouseHeartbeat } from '../scrapers/browser.js';
import { enrichProducts, setupForProductPages } from '../scrapers/keepa-product-page.js';
import { createComponentLogger } from '../utils/logger.js';
import { getActiveRun, getDealsNeedingReviews, updateDealReviewData } from './product.service.js';

const logger = createComponentLogger('ReviewEnrichment');

// ─── Mutual exclusion flag ───────────────────────────────────────────────────
// Prevents the Keepa browser from being shared between enrichment and scraping.

let _enrichmentInProgress = false;

export function isEnrichmentInProgress(): boolean {
  return _enrichmentInProgress;
}

// ─── Main enrichment cycle ───────────────────────────────────────────────────

export interface EnrichmentResult {
  enriched: number;
  total: number;
  skippedReason?: string;
}

export async function runReviewEnrichment(): Promise<EnrichmentResult> {
  // Pre-check: any deals actually need enrichment?
  const deals = await getDealsNeedingReviews();
  if (deals.length === 0) {
    logger.info('No deals need review enrichment — skipping');
    return { enriched: 0, total: 0, skippedReason: 'no-deals-needing-reviews' };
  }

  // Pre-check: scrape job running?
  const activeRun = await getActiveRun();
  if (activeRun) {
    logger.warn({ scrapeRunId: activeRun.id }, 'Enrichment skipped — scrape job in progress');
    return { enriched: 0, total: deals.length, skippedReason: 'scrape-in-progress' };
  }

  logger.info({ count: deals.length }, 'Starting review enrichment cycle');

  _enrichmentInProgress = true;
  let browser: Browser | undefined;
  const heartbeat = new MouseHeartbeat();

  try {
    const launched = await launchBrowser();
    browser = launched.browser;
    const page = launched.page;

    heartbeat.start(page);
    await setupForProductPages(page);

    const asins = deals.map(d => d.asin);
    let activePage: Page = page;
    let activeBrowser = browser;

    // Enrich with retry on browser failure
    let toProcess = [...asins];
    let retries = 0;
    const MAX_RETRIES = 2;
    const allData = new Map<
      string,
      { rating?: number; reviewCount?: number; currentPrice?: number }
    >();

    while (toProcess.length > 0 && retries <= MAX_RETRIES) {
      if (!(await isPageAlive(activePage))) {
        logger.warn('Browser died during enrichment — recovering');
        await closeBrowser(activeBrowser);
        const relaunched = await launchBrowser();
        activeBrowser = relaunched.browser;
        activePage = relaunched.page;
        browser = activeBrowser;
        heartbeat.updatePage(activePage);
        heartbeat.start(activePage);
        await setupForProductPages(activePage);
        retries++;
      }

      const { data: batchResults } = await enrichProducts(activePage, toProcess);

      for (const [asin, pageData] of batchResults) {
        allData.set(asin, {
          rating: pageData.rating,
          reviewCount: pageData.reviewCount,
          currentPrice: pageData.currentPrice,
        });
      }

      const processed = new Set(batchResults.keys());
      const remaining = toProcess.filter(a => !processed.has(a));

      if (remaining.length === toProcess.length) break;

      toProcess = remaining;
      if (toProcess.length > 0) retries++;
    }

    // Persist enrichment results to DB
    for (const [asin, data] of allData) {
      await updateDealReviewData(asin, data);
    }

    logger.info(
      { enriched: allData.size, total: deals.length, missing: deals.length - allData.size },
      'Review enrichment cycle complete'
    );

    heartbeat.stop();
    await closeBrowser(browser);

    return { enriched: allData.size, total: deals.length };
  } catch (error) {
    heartbeat.stop();
    await closeBrowser(browser);
    const message = (error as Error).message;
    logger.error({ err: message }, 'Review enrichment failed');
    throw error;
  } finally {
    _enrichmentInProgress = false;
  }
}
