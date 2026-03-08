import { Router } from 'express';
import { getDeals } from '../services/product.service.js';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('DealsRoutes');
export const dealsRouter = Router();

/**
 * GET /api/deals
 * Returns deals with optional filtering.
 * Query params: category, scrapeRunId, limit (default 50), offset (default 0)
 */
dealsRouter.get('/', async (req, res, next) => {
  try {
    const category =
      typeof req.query.category === 'string' && req.query.category.length <= 100
        ? req.query.category
        : undefined;
    const scrapeRunId =
      typeof req.query.scrapeRunId === 'string' && req.query.scrapeRunId.length <= 36
        ? req.query.scrapeRunId
        : undefined;
    const rawLimit = parseInt(String(req.query.limit ?? '50'), 10);
    const rawOffset = parseInt(String(req.query.offset ?? '0'), 10);
    const limit = Math.min(Number.isNaN(rawLimit) || rawLimit < 0 ? 50 : rawLimit, 200);
    const offset = Number.isNaN(rawOffset) || rawOffset < 0 ? 0 : rawOffset;

    const deals = await getDeals({ category, scrapeRunId, limit, offset });
    logger.info(
      { count: deals.length, category, scrapeRunId, limit, offset },
      'Deals query completed'
    );
    res.json({ data: deals, limit, offset, count: deals.length });
  } catch (err) {
    next(err);
  }
});
