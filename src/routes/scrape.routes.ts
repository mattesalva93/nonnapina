import { Router } from 'express';
import { config } from '../config/index.js';
import { scrapeKeepaDeals } from '../scrapers/keepa.js';
import { amazonService } from '../services/amazon.js';
import {
  completeScrapeRun,
  failScrapeRun,
  getActiveRun,
  getScrapeRunById,
  getScrapeRuns,
  saveProducts,
  startScrapeRun,
} from '../services/product.service.js';
import type { EnrichedProduct, KeepaProduct } from '../types/index.js';
import { logger } from '../utils/logger.js';

export const scrapeRouter = Router();

/**
 * GET /api/scrape
 * Returns the list of past scrape runs.
 */
scrapeRouter.get('/', async (_req, res, next) => {
  try {
    const runs = await getScrapeRuns();
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
    const run = await getScrapeRunById(req.params.id);
    if (!run) {
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
    const keepaProducts: KeepaProduct[] = await scrapeKeepaDeals();
    logger.info({ count: keepaProducts.length }, 'Keepa scraping complete');

    if (keepaProducts.length === 0) {
      await completeScrapeRun(scrapeRunId, 0);
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
      };
    });

    // Step 4: Persist to database
    await saveProducts(enriched, scrapeRunId);
    await completeScrapeRun(scrapeRunId, enriched.length);

    logger.info({ scrapeRunId, total: enriched.length }, 'Scrape job completed successfully');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failScrapeRun(scrapeRunId, message);
    logger.error({ scrapeRunId, error: message }, 'Scrape job failed');
    throw err;
  }
}
