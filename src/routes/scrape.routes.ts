import { Router } from 'express';
import path from 'node:path';
import { config } from '../config/index.js';
import { getLatestScreenshots, scrapeKeepaDeals } from '../scrapers/keepa.js';
import { amazonService } from '../services/amazon.js';
import { sendErrorAlert } from '../services/email.service.js';
import {
  completeScrapeRun,
  failScrapeRun,
  getActiveRun,
  getScrapeRunById,
  getScrapeRuns,
  markDealsAsLowest,
  saveProducts,
  startScrapeRun,
} from '../services/product.service.js';
import type { EnrichedProduct } from '../types/index.js';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('ScrapeRoutes');

export const scrapeRouter = Router();

/**
 * GET /api/scrape
 * Returns the list of past scrape runs.
 */
scrapeRouter.get('/', async (_req, res, next) => {
  try {
    logger.debug('Listing scrape runs');
    const runs = await getScrapeRuns();
    logger.info({ count: runs.length }, 'Scrape runs listed');
    res.json(runs);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/scrape/:id
 * Returns the status of a specific scrape run.
 */
scrapeRouter.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    logger.debug({ scrapeRunId: id }, 'Fetching scrape run by ID');
    const run = await getScrapeRunById(id);
    if (!run) {
      logger.warn({ scrapeRunId: id }, 'Scrape run not found');
      res.status(404).json({ error: 'Scrape run not found' });
      return;
    }
    res.json(run);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/scrape
 * Triggers a new background scraping run.
 * Returns 202 Accepted immediately with the scrapeRunId.
 */
scrapeRouter.post('/', async (_req, res, next) => {
  try {
    const activeRun = await getActiveRun();
    if (activeRun) {
      res.status(409).json({
        error: 'A scrape job is already running',
        scrapeRunId: activeRun.id,
      });
      return;
    }

    const scrapeRun = await startScrapeRun();

    // Fire-and-forget: run scraping in background
    runScrapeJob(scrapeRun.id).catch(err => {
      logger.error({ err: err.message }, 'Background scrape job failed unexpectedly');
    });

    res.status(202).json({
      scrapeRunId: scrapeRun.id,
      status: 'RUNNING',
      message: 'Scrape job started. Poll GET /api/scrape/:id for status.',
    });
  } catch (err) {
    next(err);
  }
});

export async function runScrapeJob(scrapeRunId: string): Promise<void> {
  logger.info({ scrapeRunId }, 'Scrape job started');

  try {
    // Step 1: Scrape Keepa
    const { products: keepaProducts, lowestAsins } = await scrapeKeepaDeals();
    logger.info({ count: keepaProducts.length }, 'Keepa scraping complete');

    if (keepaProducts.length === 0) {
      const errorMsg =
        'Scrape completed but returned 0 products — likely a browser or page load failure';
      await failScrapeRun(scrapeRunId, errorMsg);
      logger.error({ scrapeRunId }, errorMsg);
      const screenshots = await getLatestScreenshots(4);
      void sendErrorAlert({
        errorMessage: errorMsg,
        component: 'ScrapeJob',
        severity: 'critical',
        scrapeRunId,
        attachments: screenshots.map(filepath => ({
          filename: path.basename(filepath),
          path: path.resolve(filepath),
        })),
      });
      return;
    }

    // Step 2: Fetch Amazon product details
    const asins = keepaProducts.map(p => p.asin);
    const linkOptions = { storefront: config.amazon.storefrontId };
    const amazonProducts = await amazonService.getProductDetails(asins, linkOptions);
    logger.info({ count: amazonProducts.length }, 'Amazon API fetch complete');

    // Step 3: Enrich products with Keepa data
    const keepaByAsin = new Map(keepaProducts.map(p => [p.asin, p]));
    const enriched: EnrichedProduct[] = amazonProducts.map(product => {
      const keepa = keepaByAsin.get(product.asin);
      return {
        ...product,
        category: keepa?.category ?? 'Unknown',
        keepaDiscount: keepa?.discount,
        keepaAvgPrice: keepa?.avgPrice,
        keepaCurrentPrice: keepa?.currentPrice,
        keepaRating: keepa?.rating,
        keepaReviewCount: keepa?.reviewCount,
        keepaIsLowest: keepa?.isLowest ?? false,
      };
    });

    // Step 4: Persist to database
    const savedCount = await saveProducts(enriched, scrapeRunId);

    // Step 5: Mark deals as lowest for ASINs found in Pass 2 but not in Pass 1
    const pass1Asins = new Set(keepaProducts.map(p => p.asin));
    const dbOnlyLowestAsins = [...lowestAsins].filter(asin => !pass1Asins.has(asin));
    const markedCount = await markDealsAsLowest(dbOnlyLowestAsins);

    if (markedCount > 0) {
      logger.info(
        { markedCount, dbOnlyLowestAsins: dbOnlyLowestAsins.length },
        'Marked existing DB deals as isLowest from Pass 2'
      );
    }

    await completeScrapeRun(scrapeRunId, savedCount);

    logger.info(
      { scrapeRunId, enriched: enriched.length, saved: savedCount },
      'Scrape job completed successfully'
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failScrapeRun(scrapeRunId, message);
    logger.error({ scrapeRunId, error: message }, 'Scrape job failed');
    const screenshots = await getLatestScreenshots(4);
    void sendErrorAlert({
      errorMessage: `Scrape job failed: ${message}`,
      errorStack: err instanceof Error ? err.stack : undefined,
      component: 'ScrapeJob',
      severity: 'critical',
      scrapeRunId,
      attachments: screenshots.map(filepath => ({
        filename: path.basename(filepath),
        path: path.resolve(filepath),
      })),
    });
    throw err;
  }
}
