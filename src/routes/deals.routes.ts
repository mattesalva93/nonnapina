import { Router } from 'express';
import { getDeals } from '../services/product.service.js';

export const dealsRouter = Router();

/**
 * GET /api/deals
 * Returns deals with optional filtering.
 * Query params: category, scrapeRunId, limit (default 50), offset (default 0)
 */
dealsRouter.get('/', async (req, res, next) => {
  try {
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const scrapeRunId =
      typeof req.query.scrapeRunId === 'string' ? req.query.scrapeRunId : undefined;
    const limit = Math.min(parseInt(String(req.query.limit ?? '50')), 200);
    const offset = parseInt(String(req.query.offset ?? '0'));

    const deals = await getDeals({ category, scrapeRunId, limit, offset });
    res.json({ data: deals, limit, offset, count: deals.length });
  } catch (err) {
    next(err);
  }
});
